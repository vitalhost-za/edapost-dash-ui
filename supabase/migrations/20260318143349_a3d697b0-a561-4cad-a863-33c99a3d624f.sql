
-- Enable pg_net for HTTP calls from database triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to dispatch webhooks on email events
CREATE OR REPLACE FUNCTION public.notify_webhook_on_email_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
  _payload jsonb;
BEGIN
  -- Build the payload from the inserted email_log row
  _payload := jsonb_build_object(
    'user_id', NEW.user_id,
    'event_type', 'email.' || NEW.event_type,
    'data', jsonb_build_object(
      'log_id', NEW.id,
      'message_id', NEW.message_id,
      'from_address', NEW.from_address,
      'to_address', NEW.to_address,
      'subject', NEW.subject,
      'event_type', NEW.event_type,
      'response_code', NEW.response_code,
      'smtp_response', NEW.smtp_response,
      'created_at', NEW.created_at
    )
  );

  -- Read secrets from vault or use the Supabase URL and service key
  SELECT decrypted_secret INTO _supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;

  SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;

  -- Only dispatch if we have the necessary config
  IF _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := _supabase_url || '/functions/v1/dispatch-webhooks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_key
      ),
      body := _payload
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on email_logs insert
CREATE TRIGGER on_email_log_dispatch_webhook
  AFTER INSERT ON public.email_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_webhook_on_email_event();
