
ALTER TABLE public.email_queue
  ADD COLUMN html_body text,
  ADD COLUMN plain_body text;
