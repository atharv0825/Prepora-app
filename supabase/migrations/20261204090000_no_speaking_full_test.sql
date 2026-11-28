-- There is no Speaking full test any more: study plans ask for a Part 2 cue card instead.
--
-- A 'speaking_full' item was a cue card (with a Part 3 discussion and a Part 1 set), so each one
-- becomes a 'speaking_p2' item. Students' picks keep their content: a full test's pick is already
-- the cue card's id. The enum value stays (dropping one from an enum isn't worth a type rebuild);
-- nothing creates it any more.

update public.study_plan_items
set kind = 'speaking_p2'
where kind = 'speaking_full';

update public.user_study_plan_picks
set kind = 'speaking_p2'
where kind = 'speaking_full';
