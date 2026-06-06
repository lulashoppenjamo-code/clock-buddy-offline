
-- Enums
CREATE TYPE public.supply_reason AS ENUM ('terminado','queda_poco','danado','otro');
CREATE TYPE public.supply_status AS ENUM ('pendiente','aprobada','entregada','rechazada');
CREATE TYPE public.supply_movement_type AS ENUM ('entrada','salida','ajuste');

-- Categorias
CREATE TABLE public.supply_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supply_categories TO authenticated;
GRANT ALL ON public.supply_categories TO service_role;
ALTER TABLE public.supply_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their supply categories" ON public.supply_categories
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Productos
CREATE TABLE public.supplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.supply_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text,
  reorder_days integer NOT NULL DEFAULT 14,
  stock_mina numeric NOT NULL DEFAULT 0,
  stock_morelos numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplies TO authenticated;
GRANT ALL ON public.supplies TO service_role;
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their supplies" ON public.supplies
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Solicitudes
CREATE TABLE public.supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  branch text NOT NULL,
  supply_id uuid NOT NULL REFERENCES public.supplies(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  reason public.supply_reason NOT NULL DEFAULT 'terminado',
  notes text,
  status public.supply_status NOT NULL DEFAULT 'pendiente',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  delivered_at timestamptz,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supply_requests TO authenticated;
GRANT ALL ON public.supply_requests TO service_role;
ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their supply requests" ON public.supply_requests
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Movimientos
CREATE TABLE public.supply_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  supply_id uuid NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
  branch text NOT NULL,
  type public.supply_movement_type NOT NULL,
  quantity numeric NOT NULL,
  request_id uuid REFERENCES public.supply_requests(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supply_movements TO authenticated;
GRANT ALL ON public.supply_movements TO service_role;
ALTER TABLE public.supply_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their supply movements" ON public.supply_movements
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.supply_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supply_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplies;
