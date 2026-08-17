ALTER TABLE public.rest_change_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'cambio'
  CHECK (request_type IN ('cambio', 'bono'));