
ALTER TABLE public.user_settings 
  ADD COLUMN IF NOT EXISTS alert_delivery_rate numeric DEFAULT 95.0,
  ADD COLUMN IF NOT EXISTS alert_tls_expiry_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS pagerduty_routing_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notify_tls_expiry boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_delivery_rate boolean NOT NULL DEFAULT true;

ALTER TABLE public.smtp_servers
  ADD COLUMN IF NOT EXISTS tls_cert_expiry timestamp with time zone DEFAULT NULL;
