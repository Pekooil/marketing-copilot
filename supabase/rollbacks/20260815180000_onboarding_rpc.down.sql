begin;
drop function if exists public.record_onboarding_denial(uuid, uuid);
drop function if exists public.save_onboarding(uuid, integer, boolean, uuid, text, jsonb, jsonb);
drop function if exists public.get_onboarding_state(uuid);
commit;
