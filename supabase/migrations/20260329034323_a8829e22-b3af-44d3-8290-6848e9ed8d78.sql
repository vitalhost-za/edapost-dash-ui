
ALTER TABLE public.smtp_servers
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failover_group text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_health_check timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_check_status text NOT NULL DEFAULT 'unknown';

CREATE TABLE IF NOT EXISTS public.failover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_server_id uuid REFERENCES public.smtp_servers(id) ON DELETE SET NULL,
  to_server_id uuid REFERENCES public.smtp_servers(id) ON DELETE SET NULL,
  trigger_reason text NOT NULL,
  trigger_details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.failover_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own failover_events"
  ON public.failover_events FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
