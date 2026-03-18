
-- SMTP Servers table
CREATE TABLE public.smtp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  ip_address INET NOT NULL,
  port INTEGER NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'degraded', 'maintenance')),
  tls_enabled BOOLEAN NOT NULL DEFAULT true,
  max_connections INTEGER NOT NULL DEFAULT 100,
  current_connections INTEGER NOT NULL DEFAULT 0,
  queue_size INTEGER NOT NULL DEFAULT 0,
  postfix_version TEXT,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sending Domains table
CREATE TABLE public.sending_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  spf_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (spf_status IN ('valid', 'invalid', 'missing', 'unchecked')),
  dkim_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (dkim_status IN ('valid', 'invalid', 'missing', 'unchecked')),
  dmarc_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (dmarc_status IN ('valid', 'invalid', 'missing', 'unchecked')),
  mx_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (mx_status IN ('valid', 'invalid', 'missing', 'unchecked')),
  ptr_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (ptr_status IN ('valid', 'invalid', 'missing', 'unchecked')),
  verified BOOLEAN NOT NULL DEFAULT false,
  dkim_selector TEXT DEFAULT 'default',
  smtp_server_id UUID REFERENCES public.smtp_servers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IP Warmup Schedules
CREATE TABLE public.ip_warmup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  smtp_server_id UUID NOT NULL REFERENCES public.smtp_servers(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  warmup_day INTEGER NOT NULL DEFAULT 1,
  total_days INTEGER NOT NULL DEFAULT 30,
  daily_limit INTEGER NOT NULL DEFAULT 100,
  sent_today INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delivery stats (hourly aggregates)
CREATE TABLE public.delivery_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  smtp_server_id UUID REFERENCES public.smtp_servers(id) ON DELETE CASCADE,
  hour TIMESTAMPTZ NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  bounced INTEGER NOT NULL DEFAULT 0,
  deferred INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  complaints INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.smtp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_warmup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own data
CREATE POLICY "Users manage own smtp_servers" ON public.smtp_servers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own sending_domains" ON public.sending_domains FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own ip_warmup" ON public.ip_warmup FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own delivery_stats" ON public.delivery_stats FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers
CREATE TRIGGER update_smtp_servers_updated_at BEFORE UPDATE ON public.smtp_servers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sending_domains_updated_at BEFORE UPDATE ON public.sending_domains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ip_warmup_updated_at BEFORE UPDATE ON public.ip_warmup FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for delivery_stats queries
CREATE INDEX idx_delivery_stats_hour ON public.delivery_stats (user_id, hour DESC);
CREATE INDEX idx_delivery_stats_server ON public.delivery_stats (smtp_server_id, hour DESC);
