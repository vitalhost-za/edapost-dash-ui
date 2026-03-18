
-- Storage bucket for campaign attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('campaign-attachments', 'campaign-attachments', false, 5242880);

-- Campaign attachments table
CREATE TABLE public.campaign_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaign_attachments"
  ON public.campaign_attachments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own campaign_attachments"
  ON public.campaign_attachments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Storage RLS: authenticated users can upload to their own folder
CREATE POLICY "Users upload own attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
