-- Fix the contract-v2 concept-update freeze trigger introduced by
-- 20260828100000_learning_evidence_ladder.sql.
--
-- The UPDATE branch accidentally referenced NEW.outcome_source / OLD.outcome_source,
-- but public.study_result_concept_updates has no outcome_source column. That makes
-- every apply_study_concept_result_v3 completion update fail at runtime and rolls
-- back the concept update + mastery write. Keep the intended immutable evidence
-- fields, but remove the invalid field reference. The strategy-outcome table has
-- its own separate outcome_source guard.

create or replace function public.freeze_study_concept_update_evidence_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract_version smallint;
  v_evidence_tier text;
  v_target_task_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.client_attempt_id is distinct from old.client_attempt_id
        or new.evidence_contract_version is distinct from old.evidence_contract_version
        or new.evidence_tier is distinct from old.evidence_tier
        or new.target_task_kind is distinct from old.target_task_kind then
      raise exception using
        errcode = '22023',
        message = 'study concept evidence contract is immutable';
    end if;
    return new;
  end if;

  select attempt.evidence_contract_version,
         attempt.evidence_tier,
         attempt.target_task_kind
    into v_contract_version, v_evidence_tier, v_target_task_kind
  from public.study_result_attempts attempt
  where attempt.user_id = new.user_id
    and attempt.client_attempt_id = new.client_attempt_id;

  if found and v_contract_version = 2 then
    new.evidence_contract_version := v_contract_version;
    new.evidence_tier := v_evidence_tier;
    new.target_task_kind := v_target_task_kind;
  else
    new.evidence_contract_version := null;
    new.evidence_tier := null;
    new.target_task_kind := null;
  end if;

  return new;
end;
$$;
