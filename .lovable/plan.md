## Cambios solicitados

### A. Renombrar "Empleadas/Empleada" → "Colaboradores/Colaborador"

Cambios sólo de texto en la UI (no cambia tablas ni rutas internas para no romper datos existentes):

- `src/routes/empleadas.tsx`: títulos, botones y mensajes pasan a "Colaboradores", "Agregar colaborador", "colaborador eliminado", etc.
- `src/routes/index.tsx`: botón "Empleadas" → "Colaboradores".
- `src/routes/admin.tsx`: enlaces y títulos que digan "empleadas" → "colaboradores".
- `src/routes/admin-limpieza.tsx` y `src/routes/admin-insumos.tsx`: filtros/etiquetas "Empleada" → "Colaborador".

La ruta `/empleadas` y la tabla `employees` se mantienen como están (sin migración).

---

### B. Nuevo módulo "Vacaciones"

#### 1. Base de datos (migración)

Agregar a la tabla `employees`:
- `hire_date` (date, nullable) — fecha de ingreso del colaborador.
- `branch` (text, nullable) — sucursal base (`mina` | `morelos`) opcional.

Nuevas tablas en `public` con RLS por `owner_id` (+ GRANTs a `authenticated` y `service_role`):

**`vacation_requests`**
- `id, owner_id, employee_id, client_id (idempotencia offline)`
- `start_date, end_date, days_requested (int)`
- `status` enum (`pendiente` | `aprobada` | `rechazada`)
- `employee_comment, admin_comment`
- `decided_by, decided_at`
- `created_at, updated_at`

**`vacation_adjustments`** (ajustes manuales del admin: bonos, descuentos)
- `id, owner_id, employee_id, days (numeric, +/-), reason, created_by, created_at`

Realtime ADD TABLE para `vacation_requests`.

#### 2. Lógica de saldos (`src/lib/vacations.ts`)

Función `computeBalance(hireDate, today)` con las reglas:
- Antigüedad < 1 año → **0 días**.
- Antigüedad ≥ 1 año y < 2 → **7 días**.
- Antigüedad ≥ 2 años → **14 días** (tope anual).
- Devuelve `{ antiguedad_anios, asignados, usados, ajustes, disponibles }`.

`usados` = suma de `days_requested` de solicitudes `aprobada` del año vigente de servicio.
`ajustes` = suma de `vacation_adjustments`.

Helper `daysBetween(start, end)` cuenta días naturales inclusive.

#### 3. UI Colaborador (`src/routes/vacaciones.tsx`)

Botón nuevo en `index.tsx`: **"🌴 Vacaciones"** (pide PIN como Limpieza/Insumos).

Pantalla con dos pestañas:
- **Nueva solicitud**: muestra antigüedad, días disponibles/usados, date pickers (inicio/fin), cálculo automático de días, comentario opcional, botón "Enviar". Valida: fin ≥ inicio, días ≤ disponibles, no fechas pasadas.
- **Mis solicitudes**: lista en tiempo real con estado, comentarios del admin, fechas.

Si el colaborador no tiene `hire_date` configurada → mensaje "Pide al administrador que registre tu fecha de ingreso".

#### 4. Panel admin (`src/routes/admin-vacaciones.tsx`)

Pestañas:

- **Solicitudes**: tabla con filtros (colaborador, sucursal, estado, rango de fechas). Acciones: Aprobar / Rechazar (con comentario obligatorio en rechazo), Editar (fechas/días) y Eliminar.
- **Saldos**: tabla con cada colaborador, fecha de ingreso, antigüedad, asignados, usados, ajustes, disponibles. Botón "Ajustar" para agregar `vacation_adjustment` (+/- días con motivo).
- **Calendario**: vista mensual con vacaciones aprobadas pintadas por color del colaborador (filtro por sucursal).
- **Historial**: log de todas las solicitudes con auditoría (quién autorizó, cuándo).
- **Exportar**: Excel y PDF (reutilizando `xlsx` + `jspdf` ya instalados).

En `empleadas.tsx` añadir campos opcionales **Fecha de ingreso** y **Sucursal** al formulario y a la edición.

#### 5. Sincronización en tiempo real

Canal `vacation_requests` en panel admin y pantalla "Mis solicitudes" del colaborador.

#### 6. Offline

`vacation_requests` se insertan directo (requiere internet). Se valida `navigator.onLine` y se muestra aviso si no hay conexión.

---

### Archivos

**Crear**:
- migración SQL (employees +columnas, vacation_requests, vacation_adjustments, enums, realtime)
- `src/lib/vacations.ts`
- `src/routes/vacaciones.tsx`
- `src/routes/admin-vacaciones.tsx`

**Modificar**:
- `src/routes/index.tsx` (botón Vacaciones + rename Empleadas→Colaboradores)
- `src/routes/admin.tsx` (link al panel + rename)
- `src/routes/empleadas.tsx` (rename UI + campos hire_date/branch)
- `src/routes/admin-limpieza.tsx`, `src/routes/admin-insumos.tsx` (rename UI)
- `src/integrations/supabase/types.ts` (auto tras migración)

---

### Notas

Tu mensaje quedó cortado en "**5. CONTROL DE SALDOS — Crear una tabla automática para cada colaborador con: -**". Asumí los campos estándar (asignados / usados / ajustes / disponibles / antigüedad). Si querías incluir algún otro campo en la tabla de saldos, dímelo antes de aprobar y lo agrego.

¿Apruebas para empezar?
