ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS registered_by_id uuid,
  ADD COLUMN IF NOT EXISTS registered_by_name text;