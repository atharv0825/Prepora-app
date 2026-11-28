-- M8.7-A1: staff manage the study plan templates (admin "Study plans").
--
--   admin_save_study_template(id, name, days, test_type, items)  → the template's id
--     Creates a template (inactive), or edits one. A template that students are following is
--     never changed under them: saving it creates a NEW VERSION with the edits (active if the old
--     one was) and retires the old one (inactive, replaced_by → the new one), which keeps serving
--     its students until they finish or restart. get_my_study_plan reads a template's items live,
--     so this is what keeps students' active plans on their template.
--   admin_set_study_template_active(id, active)
--     Activating needs full coverage (every kind but the retired speaking_full) and at least one
--     item, and a retired version can't be reactivated. Deactivating only stops new assignments;
--     students already on the template keep it.
--
-- Both run as the caller (staff RLS on the template tables, M8.7-C1) and check is_staff().
-- speaking_full can no longer be added: there's no Speaking full test.

alter table public.study_plan_templates
  add column replaced_by uuid references public.study_plan_templates (id) on delete set null,
  add column updated_at timestamptz not null default now();
comment on column public.study_plan_templates.replaced_by is
  'M8.7-A1: set when the template was edited while students followed it; the newer version. The old one stays for those students.';

-- The kinds a template must cover (every kind but the retired speaking_full).
create function public.study_template_kinds()
returns public.study_item_kind[]
language sql
immutable
set search_path = ''
as $$
  select array['reading_test', 'listening_test', 'writing_t1', 'writing_t2', 'speaking_p1', 'speaking_p2']::public.study_item_kind[];
$$;

create function public.admin_save_study_template(
  p_id uuid,
  p_name text,
  p_days smallint,
  p_test_type public.ielts_test_type,
  p_items jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_old public.study_plan_templates;
  v_id uuid;
  v_in_use boolean := false;
  v_item jsonb;
begin
  if not public.is_staff() then
    raise exception 'only staff can manage study plans' using errcode = '42501';
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 1 and 100 then
    raise exception 'the name must be 1 to 100 characters' using errcode = '22023';
  end if;
  if p_days is null or p_days not between 1 and 60 then
    raise exception 'a plan lasts 1 to 60 days' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'day')::int not between 1 and p_days then
      raise exception 'an item is on day %, outside the plan''s % days', v_item ->> 'day', p_days using errcode = '22023';
    end if;
    if (v_item ->> 'order')::int not between 1 and 10 then
      raise exception 'a day has at most 10 items' using errcode = '22023';
    end if;
    if (v_item ->> 'kind')::public.study_item_kind <> all (public.study_template_kinds()) then
      raise exception 'the Speaking full test can''t be added: there isn''t one any more' using errcode = '22023';
    end if;
  end loop;

  if p_id is not null then
    select * into v_old from public.study_plan_templates where id = p_id for update;
    if not found then
      raise exception 'this study plan no longer exists' using errcode = 'P0002';
    end if;
    if v_old.replaced_by is not null then
      raise exception 'this is an earlier version; edit the newer one' using errcode = '22023';
    end if;
    v_in_use := exists (select 1 from public.user_study_plans where template_id = p_id and status = 'active');
  end if;

  if p_id is null or v_in_use then
    -- A new template, or a new version of one that students are following.
    insert into public.study_plan_templates (name, days, test_type, active)
    values (p_name, p_days, p_test_type, coalesce(v_old.active, false) and v_in_use)
    returning id into v_id;
    if v_in_use then
      update public.study_plan_templates set active = false, replaced_by = v_id, updated_at = now() where id = p_id;
    end if;
  else
    v_id := p_id;
    update public.study_plan_templates
    set name = p_name, days = p_days, test_type = p_test_type, updated_at = now()
    where id = v_id;
    delete from public.study_plan_items where template_id = v_id;
  end if;

  insert into public.study_plan_items (template_id, day, order_no, kind)
  select v_id, (e ->> 'day')::smallint, (e ->> 'order')::smallint, (e ->> 'kind')::public.study_item_kind
  from jsonb_array_elements(p_items) e;

  -- A version that was active must still cover everything (else it goes inactive).
  if v_in_use and exists (select 1 from public.study_plan_templates where id = v_id and active)
     and not (public.study_template_kinds() <@ (select coalesce(array_agg(kind), '{}') from public.study_plan_items where template_id = v_id)) then
    update public.study_plan_templates set active = false where id = v_id;
  end if;
  return v_id;
end;
$$;
comment on function public.admin_save_study_template(uuid, text, smallint, public.ielts_test_type, jsonb) is
  'M8.7-A1: create or edit a study plan template (staff). Editing one that students follow creates a new version and retires the old one, so their plans keep their template.';

create function public.admin_set_study_template_active(p_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_t public.study_plan_templates;
  v_kinds public.study_item_kind[];
begin
  if not public.is_staff() then
    raise exception 'only staff can manage study plans' using errcode = '42501';
  end if;
  select * into v_t from public.study_plan_templates where id = p_id for update;
  if not found then
    raise exception 'this study plan no longer exists' using errcode = 'P0002';
  end if;
  if p_active then
    if v_t.replaced_by is not null then
      raise exception 'this is an earlier version; activate the newer one' using errcode = '22023';
    end if;
    select coalesce(array_agg(kind), '{}') into v_kinds from public.study_plan_items where template_id = p_id;
    if not (public.study_template_kinds() <@ v_kinds) then
      raise exception 'it doesn''t cover every kind of practice yet' using errcode = '22023';
    end if;
  end if;
  update public.study_plan_templates set active = p_active, updated_at = now() where id = p_id;
end;
$$;
comment on function public.admin_set_study_template_active(uuid, boolean) is
  'M8.7-A1: activate (full coverage needed) or deactivate a study plan template (staff). Students already on it keep it.';

revoke all on function public.admin_save_study_template(uuid, text, smallint, public.ielts_test_type, jsonb) from public, anon;
revoke all on function public.admin_set_study_template_active(uuid, boolean) from public, anon;
grant execute on function public.admin_save_study_template(uuid, text, smallint, public.ielts_test_type, jsonb) to authenticated;
grant execute on function public.admin_set_study_template_active(uuid, boolean) to authenticated;
