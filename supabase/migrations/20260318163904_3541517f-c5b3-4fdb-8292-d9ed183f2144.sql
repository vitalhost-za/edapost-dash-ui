
-- Contact lists table
CREATE TABLE public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  contact_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contact_lists" ON public.contact_lists
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own contact_lists" ON public.contact_lists
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Contact list members table
CREATE TABLE public.contact_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, email)
);

ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contact_list_members" ON public.contact_list_members
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own contact_list_members" ON public.contact_list_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update updated_at on contact_lists
CREATE TRIGGER update_contact_lists_updated_at
  BEFORE UPDATE ON public.contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to keep contact_count in sync
CREATE OR REPLACE FUNCTION public.update_contact_list_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contact_lists SET contact_count = (
      SELECT count(*) FROM public.contact_list_members WHERE list_id = NEW.list_id
    ) WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.contact_lists SET contact_count = (
      SELECT count(*) FROM public.contact_list_members WHERE list_id = OLD.list_id
    ) WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER update_contact_list_count_trigger
  AFTER INSERT OR DELETE ON public.contact_list_members
  FOR EACH ROW EXECUTE FUNCTION public.update_contact_list_count();
