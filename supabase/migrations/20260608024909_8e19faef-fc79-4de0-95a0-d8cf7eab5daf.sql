
-- Add hire_date and branch to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS branch text;

-- Vacation status enum
DO $$ BEGIN
  CREATE TYPE public.vacation_status AS ENUM ('pendiente','aprobada','rechazada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- vacation_requests
CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  client_id text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested integer NOT NULL,
  status public.vacation_status NOT NULL DEFAULT 'pendiente',
  employee_comment text,
  admin_comment text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_requests TO authenticated;
GRANT ALL ON public.vacation_requests TO service_role;

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their vacation requests"
ON public.vacation_requests FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- vacation_adjustments
CREATE TABLE IF NOT EXISTS public.vacation_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  days numeric NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacation_adjustments TO authenticated;
GRANT ALL ON public.vacation_adjustments TO service_role;

ALTER TABLE public.vacation_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their vacation adjustments"
ON public.vacation_adjustments FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_vacation_requests_updated_at ON public.vacation_requests;
CREATE TRIGGER update_vacation_requests_updated_at
BEFORE UPDATE ON public.vacation_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.vacation_requests REPLICA IDENTITY FULL;
ALTER TABLE public.vacation_adjustments REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vacation_requests;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vacation_adjustments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
