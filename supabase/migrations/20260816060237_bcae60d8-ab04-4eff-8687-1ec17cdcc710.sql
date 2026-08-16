CREATE TABLE public.rest_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rest_schedule TO authenticated;
GRANT ALL ON public.rest_schedule TO service_role;
ALTER TABLE public.rest_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages rest_schedule" ON public.rest_schedule FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_rest_schedule_updated BEFORE UPDATE ON public.rest_schedule FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rest_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  original_weekday int CHECK (original_weekday BETWEEN 0 AND 6),
  new_date date NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, new_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rest_overrides TO authenticated;
GRANT ALL ON public.rest_overrides TO service_role;
ALTER TABLE public.rest_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages rest_overrides" ON public.rest_overrides FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_rest_overrides_date ON public.rest_overrides (owner_id, new_date);

CREATE TABLE public.rest_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  rest_date date NOT NULL,
  type text NOT NULL DEFAULT 'bono_domingo',
  reason text,
  branch text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, rest_date, type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rest_days TO authenticated;
GRANT ALL ON public.rest_days TO service_role;
ALTER TABLE public.rest_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages rest_days" ON public.rest_days FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_rest_days_date ON public.rest_days (owner_id, rest_date);