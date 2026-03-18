
-- Bounces table
CREATE TABLE public.bounces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  bounce_type TEXT NOT NULL DEFAULT 'hard' CHECK (bounce_type IN ('hard', 'soft')),
  bounce_code TEXT,
  reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  smtp_server_id UUID REFERENCES public.smtp_servers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suppression list table
CREATE TABLE public.suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  added_by TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email)
);

ALTER TABLE public.bounces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bounces" ON public.bounces
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own bounces" ON public.bounces
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users manage own suppression_list" ON public.suppression_list
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own suppression_list" ON public.suppression_list
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_bounces_user_type ON public.bounces (user_id, bounce_type);
CREATE INDEX idx_bounces_email ON public.bounces (user_id, email);
CREATE INDEX idx_suppression_user_email ON public.suppression_list (user_id, email);
