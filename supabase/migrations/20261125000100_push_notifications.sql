-- =========================================================
-- LULA SHOP · NOTIFICACIONES PUSH
-- Migración aislada. No modifica ni elimina registros
-- de checadas, solicitudes o reportes existentes.
-- =========================================================

-- 1. Dispositivos autorizados para recibir avisos.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_label text NOT NULL DEFAULT 'Teléfono',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their push devices"
ON public.push_subscriptions;

CREATE POLICY "Owners manage their push devices"
ON public.push_subscriptions
FOR ALL TO authenticated
USING ((SELECT auth.uid()) = owner_id)
WITH CHECK ((SELECT auth.uid()) = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.push_subscriptions TO authenticated;

GRANT ALL ON public.push_subscriptions TO service_role;


-- 2. Preferencias por tipo de notificación.
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, event_type),
  CONSTRAINT notification_preferences_event_type_check
    CHECK (event_type IN (
      'clock_in',
      'clock_out',
      'break_start',
      'break_end',
      'supply_request',
      'shortage_report',
      'late_incident',
      'important_incident'
    ))
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage notification preferences"
ON public.notification_preferences;

CREATE POLICY "Owners manage notification preferences"
ON public.notification_preferences
FOR ALL TO authenticated
USING ((SELECT auth.uid()) = owner_id)
WITH CHECK ((SELECT auth.uid()) = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.notification_preferences TO authenticated;

GRANT ALL ON public.notification_preferences TO service_role;


-- 3. Cola privada de eventos pendientes.
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  locked_until timestamptz,
  UNIQUE (owner_id, event_key)
);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_outbox FROM anon, authenticated;
GRANT ALL ON public.notification_outbox TO service_role;


-- 4. Registro de entrega individual por teléfono.
CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL
    REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL
    REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outbox_id, subscription_id)
);

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_deliveries FROM anon, authenticated;
GRANT ALL ON public.push_deliveries TO service_role;


-- 5. Función interna para agregar eventos a la cola.
CREATE OR REPLACE FUNCTION public.enqueue_push_notification(
  p_owner_id uuid,
  p_event_key text,
  p_event_type text,
  p_title text,
  p_body text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_outbox (
    owner_id,
    event_key,
    event_type,
    title,
    body,
    payload
  )
  VALUES (
    p_owner_id,
    p_event_key,
    p_event_type,
    p_title,
    LEFT(p_body, 240),
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (owner_id, event_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_push_notification(
  uuid, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_push_notification(
  uuid, text, text, text, text, jsonb
) TO service_role;


-- 6. Reclamar eventos de forma segura.
CREATE OR REPLACE FUNCTION public.claim_notification_outbox(
  p_batch_size integer DEFAULT 25
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH selected AS (
    SELECT id
    FROM public.notification_outbox
    WHERE processed_at IS NULL
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY created_at ASC
    LIMIT LEAST(GREATEST(p_batch_size, 1), 50)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_outbox AS q
  SET
    locked_until = now() + interval '3 minutes',
    attempts = q.attempts + 1
  FROM selected
  WHERE q.id = selected.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_outbox(integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(integer)
TO service_role;


-- 7. Trigger de checadas.
CREATE OR REPLACE FUNCTION public.notify_time_entry_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
  v_branch text;
  v_label text;
BEGIN
  BEGIN
    SELECT name, branch
    INTO v_employee_name, v_branch
    FROM public.employees
    WHERE id = NEW.employee_id;

    v_label := CASE NEW.type
      WHEN 'clock_in' THEN 'Entrada'
      WHEN 'clock_out' THEN 'Salida'
      WHEN 'break_start' THEN 'Salida a comer'
      WHEN 'break_end' THEN 'Regreso de comer'
      ELSE 'Checada'
    END;

    PERFORM public.enqueue_push_notification(
      NEW.owner_id,
      'time_entry:' || NEW.client_id,
      NEW.type::text,
      'Reloj Checador · ' || v_label,
      COALESCE(v_employee_name, 'Colaboradora')
        || ' · ' || COALESCE(v_branch, 'Sucursal sin asignar'),
      jsonb_build_object(
        'employee_id', NEW.employee_id,
        'employee_name', COALESCE(v_employee_name, 'Colaboradora'),
        'branch', COALESCE(v_branch, 'Sin sucursal'),
        'occurred_at', NEW.occurred_at,
        'created_at', NEW.created_at,
        'delayed',
          NEW.created_at > NEW.occurred_at + interval '2 minutes',
        'device_label', NEW.device_label
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push] No se pudo encolar checada: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_time_entry_insert
ON public.time_entries;

CREATE TRIGGER trg_notify_time_entry_insert
AFTER INSERT ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.notify_time_entry_insert();


-- 8. Trigger de solicitudes de insumos.
CREATE OR REPLACE FUNCTION public.notify_supply_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
  v_supply_name text;
BEGIN
  BEGIN
    SELECT name INTO v_employee_name
    FROM public.employees
    WHERE id = NEW.employee_id;

    SELECT name INTO v_supply_name
    FROM public.supplies
    WHERE id = NEW.supply_id;

    PERFORM public.enqueue_push_notification(
      NEW.owner_id,
      'supply_request:' || COALESCE(NEW.client_id, NEW.id::text),
      'supply_request',
      'Nueva solicitud de insumos',
      COALESCE(v_employee_name, 'Colaboradora')
        || ' · ' || COALESCE(NEW.branch, 'Sucursal')
        || ' · ' || COALESCE(v_supply_name, 'Producto')
        || ' · Cantidad: ' || NEW.quantity::text,
      jsonb_build_object(
        'employee_id', NEW.employee_id,
        'employee_name', COALESCE(v_employee_name, 'Colaboradora'),
        'branch', NEW.branch,
        'supply_name', COALESCE(v_supply_name, 'Producto'),
        'quantity', NEW.quantity,
        'reason', NEW.notes,
        'created_at', NEW.created_at
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push] No se pudo encolar solicitud: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_supply_request_insert
ON public.supply_requests;

CREATE TRIGGER trg_notify_supply_request_insert
AFTER INSERT ON public.supply_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_supply_request_insert();


-- 9. Trigger de reportes de faltantes.
CREATE OR REPLACE FUNCTION public.notify_shortage_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.enqueue_push_notification(
      NEW.owner_id,
      'shortage_report:' || NEW.id::text,
      'shortage_report',
      'Nuevo reporte de faltantes',
      COALESCE(NEW.employee_name, 'Colaboradora')
        || ' · ' || COALESCE(NEW.branch, 'Sucursal')
        || ' · ' || cardinality(NEW.items)::text || ' productos',
      jsonb_build_object(
        'employee_id', NEW.employee_id,
        'employee_name', NEW.employee_name,
        'branch', NEW.branch,
        'report_date', NEW.report_date,
        'item_count', cardinality(NEW.items),
        'comment', NEW.comment,
        'created_at', NEW.created_at
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push] No se pudo encolar reporte: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shortage_report_insert
ON public.shortage_reports;

CREATE TRIGGER trg_notify_shortage_report_insert
AFTER INSERT ON public.shortage_reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_shortage_report_insert();


-- 10. Índices.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner_active
ON public.push_subscriptions (owner_id, active);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
ON public.notification_outbox (created_at)
WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_preferences_owner
ON public.notification_preferences (owner_id, event_type);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_pending
ON public.push_deliveries (outbox_id, delivered_at);