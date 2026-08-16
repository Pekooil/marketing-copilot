begin;

drop function if exists public.verify_product_understanding(uuid, uuid, integer, text, text, text, uuid, text);
drop function if exists public.save_product_understanding_proposal(uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb, text);
drop function if exists public.get_product_understanding_state(uuid);
drop table if exists app.context_snapshot;
drop table if exists app.product_understanding_review;
drop table if exists app.product_understanding_proposal;
drop table if exists app.source_record;
drop function if exists app.reject_product_understanding_mutation();

commit;
