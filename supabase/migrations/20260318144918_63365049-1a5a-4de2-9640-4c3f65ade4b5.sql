
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_end_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_count INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_recurrence_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_campaign_id UUID DEFAULT NULL REFERENCES public.campaigns(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.campaigns.recurrence_pattern IS 'Recurrence: daily, weekly, biweekly, monthly, or null for one-time';
COMMENT ON COLUMN public.campaigns.recurrence_end_at IS 'When recurring schedule ends (optional)';
COMMENT ON COLUMN public.campaigns.recurrence_count IS 'Max number of recurrences (optional)';
COMMENT ON COLUMN public.campaigns.parent_campaign_id IS 'Links recurring instances to the original campaign';
