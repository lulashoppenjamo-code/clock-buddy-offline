ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS weekly_salary numeric NOT NULL DEFAULT 0;

CREATE TABLE public.weekly_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  loan_amount numeric NOT NULL DEFAULT 0,
  loan_note text,
  total_amount numeric GENERATED ALWAYS AS (base_amount + loan_amount) STORED,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_payments TO authenticated;
GRANT ALL ON public.weekly_payments TO service_role;

ALTER TABLE public.weekly_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages weekly_payments" ON public.weekly_payments
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_weekly_payments_updated
  BEFORE UPDATE ON public.weekly_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();