CREATE TYPE public.addon_sale_status AS ENUM ('pendiente','validado','rechazado');

CREATE TABLE public.addon_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  employee_name text NOT NULL,
  branch text NOT NULL,
  main_product text NOT NULL,
  addon_product text NOT NULL,
  ticket_number text NOT NULL,
  photo_path text NOT NULL,
  comment text,
  status public.addon_sale_status NOT NULL DEFAULT 'pendiente',
  reviewed_by uuid,
  reviewed_at timestamptz,
  sold_at timestamptz NOT NULL DEFAULT now(),
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_sales TO authenticated;
GRANT ALL ON public.addon_sales TO service_role;

ALTER TABLE public.addon_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their addon sales" ON public.addon_sales
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER update_addon_sales_updated_at
  BEFORE UPDATE ON public.addon_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX addon_sales_owner_sold_at_idx ON public.addon_sales (owner_id, sold_at DESC);