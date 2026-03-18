
-- A/B test variants table
CREATE TABLE public.ab_test_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  variant_label text NOT NULL DEFAULT 'A',
  subject text,
  html_body text,
  plain_body text,
  from_address text,
  scheduled_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ab_test_variants"
  ON public.ab_test_variants FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ab_test_variants"
  ON public.ab_test_variants FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Add A/B test fields to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN ab_test_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ab_test_winner_variant_id uuid REFERENCES public.ab_test_variants(id);

-- Trigger for updated_at
CREATE TRIGGER update_ab_test_variants_updated_at
  BEFORE UPDATE ON public.ab_test_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
