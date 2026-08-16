begin;
drop function if exists public.save_onboarding(uuid, integer, boolean, uuid, text, jsonb);
drop function if exists public.get_onboarding_state(uuid);
commit;
