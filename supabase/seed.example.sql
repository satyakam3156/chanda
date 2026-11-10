-- Add the two members. Replace the placeholders, then run in Supabase → SQL Editor.
-- Don't save your real emails in this file. Paste them straight into the SQL Editor.
-- Emails must be lowercase and exactly the Google accounts you sign in with.

insert into public.members (email, display_name) values
  ('your-google-email@gmail.com', 'Your name'),
  ('her-google-email@gmail.com',  'Her name');
