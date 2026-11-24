-- M3-B2: refund_credits(reservation_id) → RefundResult, for AI calls that failed after the spend.
--
-- Puts each debited credit back into the bucket it came from and writes 'refund' ledger rows
-- with the same reservation_id. Idempotent: a second call for the same reservation refunds
-- nothing (status 'already_refunded'), so retries in the Edge helper are safe. A refunded spend
-- also stops counting toward today's cap (credits_spent_today skips refunded reservations).
-- If the original bucket has expired meanwhile, the credits go back but stay unusable, exactly
-- as if the spend had never happened. Service role only.

create function public.refund_credits(p_reservation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_refunded integer := 0;
  v_row record;
begin
  select l.user_id into v_user
  from public.credit_ledger l
  where l.reservation_id = p_reservation_id and l.reason = 'spend'
  limit 1;
  if v_user is null then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'reservation_id', p_reservation_id, 'refunded', 0);
  end if;

  perform public.lock_user_credits(v_user);

  if exists (select 1 from public.credit_ledger where reservation_id = p_reservation_id and reason = 'refund') then
    return jsonb_build_object('ok', true, 'status', 'already_refunded', 'reservation_id', p_reservation_id,
      'refunded', 0, 'balance_after', public.credit_balance(v_user));
  end if;

  for v_row in
    select l.bucket_id, l.delta, l.action_key, l.ref_id
    from public.credit_ledger l
    where l.reservation_id = p_reservation_id and l.reason = 'spend' and l.bucket_id is not null
    order by l.id
  loop
    update public.credit_buckets set remaining = remaining - v_row.delta where id = v_row.bucket_id;
    insert into public.credit_ledger (user_id, bucket_id, delta, reason, action_key, ref_id, reservation_id)
    values (v_user, v_row.bucket_id, -v_row.delta, 'refund', v_row.action_key, v_row.ref_id, p_reservation_id);
    v_refunded := v_refunded - v_row.delta;
  end loop;

  return jsonb_build_object('ok', true, 'status', 'refunded', 'reservation_id', p_reservation_id,
    'refunded', v_refunded, 'balance_after', public.credit_balance(v_user));
end;
$$;

comment on function public.refund_credits(uuid) is
  'Refunds one spend_credits reservation (M3-B2) into its original buckets. Idempotent. Service role only.';

revoke all on function public.refund_credits(uuid) from public, anon, authenticated;
grant execute on function public.refund_credits(uuid) to service_role;
