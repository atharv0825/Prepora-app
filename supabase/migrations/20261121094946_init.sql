-- M0-B2: baseline migration.
-- Intentionally empty. It proves the pipeline (local apply -> CI dry-run -> push to staging)
-- before any real schema lands. Real tables start in M1 (profiles) — see plan.md.
select 1;
