## Módulo "Solicitud de Insumos de Limpieza"

Reutiliza empleados, PINs, sucursales (`mina` / `morelos`) y el patrón de cola offline del módulo de Limpieza.

### 1. Base de datos (migración)

Nuevas tablas en `public` con RLS por `owner_id` + GRANTs:

- **`supply_categories`** — `id, owner_id, name, slug, active` 
  (semillas: `limpieza`. Preparado para `papeleria`, `cafeteria`, `unas`, `herramientas`, `mantenimiento`)
- **`supplies`** — `id, owner_id, category_id, name, unit, reorder_days, stock, active`
  (semillas: cloro 1L, fabuloso 4L, jabón polvo 500g, papel higiénico 4 rollos, escoba, trapeador, recogedor, franela)
- **`supply_requests`** — `id, owner_id, employee_id, branch, supply_id, quantity, reason ('terminado'|'queda_poco'|'danado'|'otro'), notes, status ('pendiente'|'aprobada'|'entregada'|'rechazada'), requested_at, decided_at, decided_by, delivered_at, client_id`
- **`supply_movements`** — `id, owner_id, supply_id, branch, type ('entrada'|'salida'|'ajuste'), quantity, request_id (nullable), notes, created_by, created_at`

Realtime habilitado en `supply_requests` y `supply_movements` (ADD TABLE supabase_realtime).

### 2. UI Empleados (`src/routes/insumos.tsx`)

- Botón nuevo en `index.tsx`: **"📦 Solicitar Insumos"** (pide PIN igual que Limpieza).
- Selector de sucursal (Mina/Morelos).
- Lista de productos agrupados por categoría (sólo Limpieza visible por ahora, las demás categorías quedan estructuradas pero ocultas).
- Por producto: cantidad, motivo (select), observaciones.
- Botón "Enviar solicitud" → inserta en `supply_requests` con `status='pendiente'` (cola offline si no hay internet).
- Pantalla "Mis solicitudes" con estado en vivo.

### 3. Panel admin (`src/routes/admin-insumos.tsx`)

Pestañas:
- **Solicitudes**: tabla con filtros (sucursal, empleado, fechas, estado). Acciones por fila: Aprobar / Rechazar / Marcar entregada. Al entregar genera `supply_movement` tipo `salida` y descuenta `stock`.
- **Inventario**: lista de productos con stock por sucursal, botón "Entrada" (suma stock + movimiento), historial de movimientos.
- **Historial por producto**: último pedido, frecuencia (días promedio), total por mes, top empleado, top sucursal.
- **Dashboard**: cards con productos más consumidos, consumo mensual por sucursal, conteos por estado.
- **Catálogo**: CRUD de productos y categorías (preparado para futuras categorías).

### 4. Alertas inteligentes

Al aprobar/listar una solicitud, comparar `requested_at` contra el último pedido aprobado del mismo producto+sucursal. Si `días < reorder_days`, badge amarillo:
> "El último pedido de cloro fue hace 8 días. Verifique antes de aprobar."

`reorder_days` configurable por producto (default 14).

### 5. Reportes

- Exportar Excel (SheetJS `xlsx`) y PDF (`jspdf` + `jspdf-autotable`) desde la tabla filtrada de solicitudes y desde el dashboard.

### 6. Sincronización en tiempo real

`supabase.channel('supply_requests').on('postgres_changes', ...)` en el panel admin y en "Mis solicitudes" del empleado.

### 7. Offline

Extender `offline-queue.ts` con store `supply_requests` y `sync.ts` para subirlas con idempotencia por `client_id`.

### Archivos

**Crear**: migración SQL, `src/lib/supplies.ts`, `src/routes/insumos.tsx`, `src/routes/admin-insumos.tsx`.
**Modificar**: `src/routes/index.tsx` (botón), `src/routes/admin.tsx` (link al panel), `src/lib/sync.ts` y `offline-queue.ts` (cola), `src/integrations/supabase/types.ts` (auto).

**Dependencias nuevas**: `xlsx`, `jspdf`, `jspdf-autotable`.

¿Apruebas para empezar?
