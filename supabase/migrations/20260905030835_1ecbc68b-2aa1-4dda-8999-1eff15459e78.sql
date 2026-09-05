CREATE TABLE public.shortage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  branch text NOT NULL,
  report_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Mexico_City')::date,
  items text[] NOT NULL DEFAULT '{}',
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, report_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortage_reports TO authenticated;
GRANT ALL ON public.shortage_reports TO service_role;

ALTER TABLE public.shortage_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages shortage_reports"
ON public.shortage_reports
FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_shortage_reports_updated
BEFORE UPDATE ON public.shortage_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_shortage_reports_owner_date ON public.shortage_reports (owner_id, report_date DESC);