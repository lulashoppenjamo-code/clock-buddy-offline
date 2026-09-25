-- ============================================================
-- LULA SHOP OS
-- CLIENTES + ESCUELAS + BENEFICIOS
-- Migración segura: conserva los datos actuales de clientes
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA DE ESCUELAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

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

  CONSTRAINT schools_owner_name_unique
    UNIQUE (owner_id, name)
);


-- ------------------------------------------------------------
-- 2. PERMISOS
-- ------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.schools
TO authenticated;

GRANT ALL
ON public.schools
TO service_role;


-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ------------------------------------------------------------

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Owners manage their schools"
ON public.schools;


CREATE POLICY "Owners manage their schools"
ON public.schools
FOR ALL
USING (
  auth.uid() = owner_id
)
WITH CHECK (
  auth.uid() = owner_id
);


-- ------------------------------------------------------------
-- 4. ÍNDICES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS schools_owner_idx
ON public.schools(owner_id);


CREATE INDEX IF NOT EXISTS schools_name_idx
ON public.schools(name);


-- ------------------------------------------------------------
-- 5. TRIGGER updated_at
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS update_schools_updated_at
ON public.schools;


CREATE TRIGGER update_schools_updated_at
BEFORE UPDATE
ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ------------------------------------------------------------
-- 6. RELACIÓN CLIENTE → ESCUELA
--
-- No eliminamos customers.school.
-- Se conserva para compatibilidad con los datos actuales.
-- ------------------------------------------------------------

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS school_id UUID
REFERENCES public.schools(id)
ON DELETE SET NULL;


-- ------------------------------------------------------------
-- 7. ÍNDICE DE CLIENTES POR ESCUELA
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS customers_school_id_idx
ON public.customers(school_id);


-- ------------------------------------------------------------
-- 8. RECUPERAR ESCUELAS QUE YA EXISTÍAN COMO TEXTO
--
-- Si un cliente tenía:
-- school = "Preparatoria X"
--
-- se crea automáticamente esa escuela.
-- ------------------------------------------------------------

INSERT INTO public.schools (
  owner_id,
  name
)
SELECT DISTINCT
  c.owner_id,
  TRIM(c.school)
FROM public.customers c
WHERE c.school IS NOT NULL
  AND TRIM(c.school) <> ''
ON CONFLICT (owner_id, name)
DO NOTHING;


-- ------------------------------------------------------------
-- 9. RELACIONAR LOS CLIENTES EXISTENTES
--
-- Convierte:
--
-- customers.school = "Preparatoria X"
--
-- en:
--
-- customers.school_id = UUID de Preparatoria X
-- ------------------------------------------------------------

UPDATE public.customers c
SET school_id = s.id
FROM public.schools s
WHERE s.owner_id = c.owner_id
  AND LOWER(TRIM(s.name)) = LOWER(TRIM(c.school))
  AND c.school_id IS NULL;


-- ------------------------------------------------------------
-- 10. ÍNDICE PARA BÚSQUEDA RÁPIDA DE CLIENTES POR ESCUELA
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS customers_owner_school_idx
ON public.customers(owner_id, school_id);


-- ------------------------------------------------------------
-- FIN DE MIGRACIÓN
-- ------------------------------------------------------------