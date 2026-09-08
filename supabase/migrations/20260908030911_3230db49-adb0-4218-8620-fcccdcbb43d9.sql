CREATE TABLE public.perfume_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  branch text NOT NULL,
  perfume_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  ticket_number text,
  comment text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfume_sales TO authenticated;
GRANT ALL ON public.perfume_sales TO service_role;

ALTER TABLE public.perfume_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages perfume_sales" ON public.perfume_sales
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_perfume_sales_updated
  BEFORE UPDATE ON public.perfume_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_perfume_sales_owner_sold ON public.perfume_sales (owner_id, sold_at DESC);