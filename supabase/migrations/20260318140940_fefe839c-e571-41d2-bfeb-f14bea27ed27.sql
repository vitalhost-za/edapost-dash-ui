
-- Email delivery logs table
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('queued', 'sent', 'delivered', 'bounced', 'deferred', 'failed', 'opened', 'clicked', 'complained', 'unsubscribed')),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  smtp_server_id UUID REFERENCES public.smtp_servers(id) ON DELETE SET NULL,
  smtp_response TEXT,
  response_code TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email_logs" ON public.email_logs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own email_logs" ON public.email_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_email_logs_user_event ON public.email_logs (user_id, event_type);
CREATE INDEX idx_email_logs_created ON public.email_logs (user_id, created_at DESC);
CREATE INDEX idx_email_logs_to ON public.email_logs (user_id, to_address);
CREATE INDEX idx_email_logs_message ON public.email_logs (message_id);

-- Enable realtime for live log streaming
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_logs;
