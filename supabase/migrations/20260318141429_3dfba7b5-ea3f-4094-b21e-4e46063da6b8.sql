
-- User settings table
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  system_name TEXT NOT NULL DEFAULT 'EdaPost Production',
  default_from_address TEXT NOT NULL DEFAULT 'noreply@example.com',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  smtp_hostname TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_tls_mode TEXT NOT NULL DEFAULT 'starttls' CHECK (smtp_tls_mode IN ('none', 'starttls', 'tls')),
  smtp_max_message_size INTEGER DEFAULT 25,
  smtp_connection_limit INTEGER DEFAULT 100,
  slack_webhook_url TEXT,
  alert_email TEXT,
  alert_bounce_rate NUMERIC(5,2) DEFAULT 5.0,
  alert_complaint_rate NUMERIC(5,2) DEFAULT 0.1,
  alert_queue_depth INTEGER DEFAULT 10000,
  notify_bounces BOOLEAN NOT NULL DEFAULT true,
  notify_complaints BOOLEAN NOT NULL DEFAULT true,
  notify_queue_full BOOLEAN NOT NULL DEFAULT true,
  notify_server_down BOOLEAN NOT NULL DEFAULT true,
  warmup_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API keys table
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT 'full' CHECK (permissions IN ('full', 'send_only', 'read_only')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own api_keys" ON public.api_keys
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own api_keys" ON public.api_keys
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_api_keys_user ON public.api_keys (user_id);
