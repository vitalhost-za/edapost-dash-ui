ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS notify_queue_latency boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS alert_queue_latency_seconds integer DEFAULT 300;