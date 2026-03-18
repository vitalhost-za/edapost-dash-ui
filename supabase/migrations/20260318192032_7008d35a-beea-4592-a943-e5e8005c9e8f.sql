
-- Domain rate limits table for per-domain sending rate control
CREATE TABLE public.domain_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  max_per_minute INTEGER NOT NULL DEFAULT 10,
  max_per_hour INTEGER NOT NULL DEFAULT 200,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain)
);

ALTER TABLE public.domain_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own domain_rate_limits"
  ON public.domain_rate_limits FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own domain_rate_limits"
  ON public.domain_rate_limits FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Domain send tracking for rate limit enforcement
CREATE TABLE public.domain_send_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.domain_send_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own domain_send_tracking"
  ON public.domain_send_tracking FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add worker config columns to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS worker_concurrency INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS worker_batch_size INTEGER NOT NULL DEFAULT 20;

-- Trigger for updated_at on domain_rate_limits
CREATE TRIGGER update_domain_rate_limits_updated_at
  BEFORE UPDATE ON public.domain_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
