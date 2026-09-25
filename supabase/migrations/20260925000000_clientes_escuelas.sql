-- ============================================================
-- CLIENTES + ESCUELAS
-- No elimina ni modifica los datos existentes de clientes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  discount_type TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT schools_owner_name_unique UNIQUE (owner_id, name)
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;

DROP POLICY IF EXISTS "Owners manage their schools" ON public.schools;

CREATE POLICY "Owners manage their schools"
ON public.schools
FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS schools_owner_idx
ON public.schools(owner_id);

CREATE INDEX IF NOT EXISTS schools_active_idx
ON public.schools(owner_id, active);

DROP TRIGGER IF EXISTS update_schools_updated_at ON public.schools;

CREATE TRIGGER update_schools_updated_at
BEFORE UPDATE ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- CONSERVAR Y NORMALIZAR ESCUELAS YA EXISTENTES
-- ============================================================

INSERT INTO public.schools (owner_id, name)
SELECT DISTINCT
  c.owner_id,
  trim(c.school)
FROM public.customers c
WHERE c.school IS NOT NULL
  AND trim(c.school) <> ''
ON CONFLICT (owner_id, name) DO NOTHING;