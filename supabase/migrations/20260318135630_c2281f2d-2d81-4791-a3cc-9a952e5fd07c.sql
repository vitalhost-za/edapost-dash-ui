
-- Allow users to delete their own smtp_servers
CREATE POLICY "Users can delete own smtp_servers" ON public.smtp_servers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Allow users to delete their own sending_domains  
CREATE POLICY "Users can delete own sending_domains" ON public.sending_domains FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Allow users to delete their own ip_warmup
CREATE POLICY "Users can delete own ip_warmup" ON public.ip_warmup FOR DELETE TO authenticated USING (auth.uid() = user_id);
