## Módulo de Limpieza

### Decisiones del usuario
- **Sucursales**: selector fijo con "Sucursal Mina" y "Sucursal Morelos"
- **Acceso empleado**: botón "Limpieza" aparte en pantalla principal (pide PIN)
- **Notificaciones**: visuales en app + push del navegador
- **Fotos**: opcionales (antes/después)

---

### 1. Base de datos (migración)

Nuevas tablas en `public`:

- **`cleaning_areas`** — áreas por sucursal
  - `id, owner_id, branch (text: 'mina'|'morelos'), name, active, created_at`
- **`cleaning_tasks`** — plantillas de tareas recurrentes
  - `id, owner_id, area_id, name, frequency ('daily'|'weekly'|'monthly'), description, requires_photo, active, created_at`
- **`cleaning_logs`** — registros de limpiezas completadas
  - `id, owner_id, task_id, area_id, employee_id, branch, completed_at, notes, photo_before_path, photo_after_path, client_id (idempotencia), latitude, longitude, created_at`
- **`push_subscriptions`** — suscripciones push del navegador
  - `id, owner_id, endpoint, p256dh, auth, created_at`

Todas con RLS (`auth.uid() = owner_id`) + GRANTs a `authenticated` y `service_role`.

Reutiliza bucket `checador-photos` para evidencias.

### 2. UI Empleados

- En `src/routes/index.tsx`: botón "Limpieza" debajo del teclado.
- Nueva ruta `src/routes/limpieza.tsx`:
  - Selector sucursal (Mina/Morelos)
  - Pide PIN igual que checada
  - Lista de tareas pendientes hoy/semana/mes agrupadas por área
  - Cada tarea: checkbox, botón cámara (antes/después), input observaciones
  - Botón "Completar" → guarda log (con cola offline)
  - Estado semáforo por tarea

### 3. UI Admin (`src/routes/admin-limpieza.tsx`)

- Dashboard:
  - Áreas pendientes / vencidas / al día
  - Top empleado del periodo
  - % cumplimiento por sucursal
- CRUD áreas (por sucursal)
- CRUD tareas recurrentes
- Historial filtrable (fecha, empleado, sucursal, área)
- Vista de foto antes/después + ubicación

Link desde `/admin` al nuevo panel.

### 4. Offline + sincronización

- Extender `src/lib/offline-queue.ts` y `src/lib/sync.ts` para soportar `cleaning_logs` además de `time_entries`.
- Cache local de áreas + tareas (carga al abrir con internet).
- Idempotencia vía `client_id`.

### 5. Notificaciones

- **In-app**: badge rojo en botón "Limpieza" si hay tareas vencidas, cálculo client-side.
- **Push web**: 
  - Registrar suscripción al entrar (botón "Activar notificaciones" en admin)
  - Server function `sendCleaningReminders` + cron `pg_cron` cada hora que llame a `/api/public/hooks/cleaning-reminders`
  - Calcula tareas vencidas/próximas y manda push usando VAPID
  - Requiere secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### 6. Lógica semáforo

Por tarea+área, basado en `frequency` y último `completed_at`:
- Verde: < 80% del periodo
- Amarillo: 80–100% del periodo
- Rojo: vencido (> periodo)

### Archivos a crear/modificar

**Crear**:
- migración SQL (4 tablas)
- `src/lib/cleaning.ts` (lógica semáforo, helpers)
- `src/lib/push.ts` (suscripción, VAPID)
- `src/routes/limpieza.tsx`
- `src/routes/admin-limpieza.tsx`
- `src/routes/api/public/hooks/cleaning-reminders.tsx`

**Modificar**:
- `src/routes/index.tsx` (botón Limpieza)
- `src/routes/admin.tsx` (link al panel limpieza)
- `src/lib/offline-queue.ts` y `src/lib/sync.ts` (soportar cleaning_logs)
- `public/sw.js` (manejar push events)

### Notas

- Necesito que apruebes para empezar; será un cambio grande (~8 archivos nuevos, 4 modificados, 1 migración).
- Las claves VAPID las generaré y guardaré como secrets; el navegador pedirá permiso al activar notificaciones.
- Sucursales hardcoded como `'mina'` y `'morelos'`; fácil de extender después si agregas más.