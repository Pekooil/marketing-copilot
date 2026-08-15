begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'founder-a@example.test', crypt('local-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'founder-b@example.test', crypt('local-test-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into app.user_account (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'Founder A'),
  ('20000000-0000-0000-0000-000000000002', 'Founder B')
on conflict (id) do nothing;

insert into app.workspace (id, name, slug, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Founder A Workspace', 'founder-a', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Founder B Workspace', 'founder-b', '20000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into app.membership (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner')
on conflict (workspace_id, user_id) do nothing;

commit;
