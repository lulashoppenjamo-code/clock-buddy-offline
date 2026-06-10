
-- ============= PHASE 1: INVENTORY CORE =============

CREATE TYPE public.inventory_movement_type AS ENUM (
  'entrada','salida','ajuste','consumo','traspaso_out','traspaso_in','correccion'
);
CREATE TYPE public.transfer_status AS ENUM (
  'pendiente','autorizado','en_transito','recibido','recibido_diferencias','cancelado'
);
CREATE TYPE public.count_status AS ENUM ('abierto','cerrado');
CREATE TYPE public.count_frequency AS ENUM ('manual','diario','semanal','mensual');
CREATE TYPE public.alert_kind AS ENUM ('stock_min','agotado','diferencia','traspaso','ajuste');

-- product_categories
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  owner_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text, email text, notes text,
  owner_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code text NOT NULL UNIQUE,
  barcode text UNIQUE,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  brand text,
  unit text DEFAULT 'pza',
  cost numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  stock_min integer NOT NULL DEFAULT 0,
  stock_max integer NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  photo_path text,
  active boolean NOT NULL DEFAULT true,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_products_name ON public.products(name);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- inventory_stock
CREATE TABLE public.inventory_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  owner_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, branch)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock TO authenticated;
GRANT ALL ON public.inventory_stock TO service_role;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_stock_product ON public.inventory_stock(product_id);

-- inventory_movements
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch text NOT NULL,
  type public.inventory_movement_type NOT NULL,
  quantity numeric(14,2) NOT NULL,
  qty_before numeric(14,2) NOT NULL DEFAULT 0,
  qty_after numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  area text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  authorized_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  transfer_id uuid,
  device_label text,
  latitude double precision,
  longitude double precision,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_mov_product ON public.inventory_movements(product_id);
CREATE INDEX idx_mov_created ON public.inventory_movements(created_at DESC);

-- inventory_transfers
CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  origin_branch text NOT NULL,
  dest_branch text NOT NULL,
  status public.transfer_status NOT NULL DEFAULT 'pendiente',
  sent_by uuid REFERENCES public.employees(id),
  authorized_by uuid REFERENCES public.employees(id),
  received_by uuid REFERENCES public.employees(id),
  sent_at timestamptz,
  received_at timestamptz,
  reason text, notes text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfers TO authenticated;
GRANT ALL ON public.inventory_transfers TO service_role;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_transfers_updated BEFORE UPDATE ON public.inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE IF NOT EXISTS public.transfer_folio_seq START 1;

CREATE TABLE public.inventory_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_sent numeric(14,2) NOT NULL,
  qty_received numeric(14,2),
  qty_before numeric(14,2),
  qty_after numeric(14,2),
  difference_reason text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfer_items TO authenticated;
GRANT ALL ON public.inventory_transfer_items TO service_role;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_transfer_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inventory_transfer_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  photo_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfer_photos TO authenticated;
GRANT ALL ON public.inventory_transfer_photos TO service_role;
ALTER TABLE public.inventory_transfer_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_transfer_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- inventory_counts
CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch text NOT NULL,
  area text,
  status public.count_status NOT NULL DEFAULT 'abierto',
  scheduled_for date,
  frequency public.count_frequency NOT NULL DEFAULT 'manual',
  responsible_employee_id uuid REFERENCES public.employees(id),
  notes text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_counts TO authenticated;
GRANT ALL ON public.inventory_counts TO service_role;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_theoretical numeric(14,2) NOT NULL DEFAULT 0,
  qty_physical numeric(14,2),
  difference numeric(14,2),
  value_difference numeric(14,2)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_items TO authenticated;
GRANT ALL ON public.inventory_count_items TO service_role;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_count_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audit (immutable)
CREATE TABLE public.inventory_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_employee_id uuid REFERENCES public.employees(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  branch text,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inventory_audit_log TO authenticated;
GRANT ALL ON public.inventory_audit_log TO service_role;
ALTER TABLE public.inventory_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_auth" ON public.inventory_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_auth" ON public.inventory_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- alerts
CREATE TABLE public.inventory_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.alert_kind NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  branch text,
  message text NOT NULL,
  read_at timestamptz,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_alerts TO authenticated;
GRANT ALL ON public.inventory_alerts TO service_role;
ALTER TABLE public.inventory_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_auth" ON public.inventory_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger: apply movement -> update stock + alerts
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current numeric(14,2);
  v_delta numeric(14,2);
  v_new numeric(14,2);
  v_min integer;
  v_pname text;
BEGIN
  -- Determine delta based on type
  IF NEW.type IN ('entrada','traspaso_in') THEN
    v_delta := NEW.quantity;
  ELSIF NEW.type IN ('salida','consumo','traspaso_out') THEN
    v_delta := -NEW.quantity;
  ELSIF NEW.type IN ('ajuste','correccion') THEN
    -- For ajuste/correccion, quantity is the SIGNED delta
    v_delta := NEW.quantity;
  END IF;

  -- Upsert stock row
  INSERT INTO public.inventory_stock (product_id, branch, quantity, owner_id, updated_at)
  VALUES (NEW.product_id, NEW.branch, 0, NEW.owner_id, now())
  ON CONFLICT (product_id, branch) DO NOTHING;

  SELECT quantity INTO v_current FROM public.inventory_stock
    WHERE product_id = NEW.product_id AND branch = NEW.branch FOR UPDATE;

  v_new := COALESCE(v_current,0) + v_delta;

  UPDATE public.inventory_stock SET quantity = v_new, updated_at = now()
    WHERE product_id = NEW.product_id AND branch = NEW.branch;

  NEW.qty_before := COALESCE(v_current, 0);
  NEW.qty_after := v_new;

  -- Stock alerts
  SELECT stock_min, name INTO v_min, v_pname FROM public.products WHERE id = NEW.product_id;
  IF v_new <= 0 THEN
    INSERT INTO public.inventory_alerts (kind, product_id, branch, message, owner_id)
    VALUES ('agotado', NEW.product_id, NEW.branch, v_pname || ' agotado en ' || NEW.branch, NEW.owner_id);
  ELSIF v_min IS NOT NULL AND v_new <= v_min THEN
    INSERT INTO public.inventory_alerts (kind, product_id, branch, message, owner_id)
    VALUES ('stock_min', NEW.product_id, NEW.branch, v_pname || ' bajo mínimo en ' || NEW.branch || ' (' || v_new || ')', NEW.owner_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_movement
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- Folio generator
CREATE OR REPLACE FUNCTION public.gen_transfer_folio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    NEW.folio := 'TR-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.transfer_folio_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_transfer_folio BEFORE INSERT ON public.inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION public.gen_transfer_folio();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_stock;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_alerts;
