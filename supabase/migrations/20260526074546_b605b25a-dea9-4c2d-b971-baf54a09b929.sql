
-- Employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, pin)
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their employees"
  ON public.employees FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Entry type enum
CREATE TYPE public.entry_type AS ENUM ('clock_in','clock_out','break_start','break_end');

-- Time entries
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type public.entry_type NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  photo_path TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);

CREATE INDEX idx_time_entries_owner_emp_time
  ON public.time_entries (owner_id, employee_id, occurred_at DESC);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their time entries"
  ON public.time_entries FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Storage bucket for photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('checador-photos', 'checador-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owners read own checador photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'checador-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners upload own checador photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'checador-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners update own checador photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'checador-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners delete own checador photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'checador-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
