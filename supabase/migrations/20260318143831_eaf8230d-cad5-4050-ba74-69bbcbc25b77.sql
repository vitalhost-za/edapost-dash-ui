
-- Add retry tracking columns to webhook_deliveries
ALTER TABLE public.webhook_deliveries
  ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN next_retry_at TIMESTAMPTZ,
  ADD COLUMN delivery_id UUID DEFAULT gen_random_uuid();

-- Update existing rows
UPDATE public.webhook_deliveries SET delivery_id = id WHERE delivery_id IS NULL;

-- Index for retry queue processing
CREATE INDEX idx_webhook_deliveries_retry
  ON public.webhook_deliveries (next_retry_at)
  WHERE next_retry_at IS NOT NULL AND success = false;
