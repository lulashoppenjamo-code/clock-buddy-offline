# Plan: Módulo Empresarial de Inventarios

Este es un módulo grande. Propongo construirlo en **fases incrementales** para entregar valor rápido y validar contigo antes de seguir.

## Alcance global

Sistema de inventario multi-sucursal (Mina / Morelos) integrado al reloj checador, con catálogo central, movimientos auditables, traspasos con recepción, conteos físicos, consumo por área, códigos de barras, dashboard y reportes.

## Arquitectura

- **Base de datos** (Lovable Cloud / Postgres) con Realtime activo en tablas clave.
- **Frontend**: módulo `/inventario` (colaborador, PIN) y `/admin-inventario` (administrador, candado existente).
- **Integración con reloj checador**: cada movimiento guarda `employee_id`, `branch`, `device_label`, `latitude/longitude`, `created_at`, igual que `time_entries`.
- **Auditoría**: tabla `inventory_audit_log` inmutable (sin UPDATE/DELETE en políticas RLS).
- **Reportes**: Excel con `xlsx` y PDF con `jspdf` (ya instalados).
- **Códigos de barras**: input con autofocus que captura lectores USB/Bluetooth HID (se comportan como teclado). Búsqueda por `barcode`, `internal_code` o nombre.

## Modelo de datos (nuevas tablas)

```text
products
  id, internal_code (uniq), barcode (uniq null), name, description,
  category_id, brand, unit, cost, price, stock_min, stock_max,
  supplier_id, photo_path, active, owner_id, created_at, updated_at

product_categories  (id, name, slug, owner_id, active)
suppliers           (id, name, phone, email, notes, owner_id, active)

inventory_stock          -- existencia por sucursal
  id, product_id, branch, quantity, updated_at, owner_id
  UNIQUE(product_id, branch)

inventory_movements      -- entradas/salidas/ajustes/consumo
  id, product_id, branch, type (entrada|salida|ajuste|consumo|traspaso_out|traspaso_in|correccion),
  quantity, qty_before, qty_after, reason, area, employee_id,
  authorized_by, transfer_id, device_label, latitude, longitude,
  owner_id, created_at

inventory_transfers      -- traspasos
  id, folio (auto), origin_branch, dest_branch, status (pendiente|autorizado|en_transito|recibido|recibido_diferencias|cancelado),
  sent_by, authorized_by, received_by, sent_at, received_at,
  reason, notes, sender_pin_employee_id, receiver_pin_employee_id,
  owner_id, created_at, updated_at

inventory_transfer_items
  id, transfer_id, product_id, qty_sent, qty_received, qty_before, qty_after,
  difference_reason

inventory_transfer_photos
  id, transfer_id, kind (envio|recepcion|dano|diferencia), photo_path, created_at

inventory_counts         -- conteos físicos / cíclicos
  id, branch, area, status (abierto|cerrado), scheduled_for, frequency (manual|diario|semanal|mensual),
  responsible_employee_id, notes, owner_id, created_at, closed_at

inventory_count_items
  id, count_id, product_id, qty_theoretical, qty_physical, difference, value_difference

inventory_audit_log      -- inmutable
  id, actor_employee_id, action, entity, entity_id, before (jsonb), after (jsonb),
  branch, device_label, created_at

inventory_alerts
  id, kind (stock_min|agotado|diferencia|traspaso|ajuste), product_id, branch,
  message, read_at, created_at
```

Todas con RLS, GRANT a authenticated, índices en `product_id`, `branch`, `created_at`, y Realtime en `products`, `inventory_stock`, `inventory_movements`, `inventory_transfers`, `inventory_alerts`.

Trigger `update_stock_on_movement` que ajusta `inventory_stock` y escribe a `inventory_audit_log` automáticamente.

## Fases propuestas

### Fase 1 — Núcleo (lo construyo ahora si lo apruebas)
1. Migración completa con todas las tablas, triggers, RLS, Realtime.
2. Catálogo de productos (admin): CRUD, categorías, proveedores, foto, código de barras, importar Excel/CSV, exportar.
3. Existencias por sucursal + búsqueda con lector de códigos de barras.
4. Movimientos básicos: entrada, salida, ajuste, consumo por área — con PIN del colaborador, registro de sucursal/dispositivo/ubicación.
5. Alertas de stock mínimo y agotado.

### Fase 2 — Traspasos
6. Crear traspaso (origen → destino) con folio, PIN del que envía, fotos, descuento automático.
7. Recepción con PIN, fotos, validación de cantidades, generación de incidencias por diferencias.
8. Estados completos y notificaciones al admin.

### Fase 3 — Conteos físicos y cíclicos
9. Iniciar conteo por sucursal/área, capturar físico con lector, cierre y reporte de diferencias valorizadas.
10. Programación de conteos cíclicos (diario/semanal/mensual) con % de avance.

### Fase 4 — Dashboard, reportes y auditoría
11. Dashboard ejecutivo con KPIs en tiempo real.
12. Reportes filtrables Excel/PDF de todo (inventario, movimientos, traspasos, conteos, consumo por área).
13. Vista de bitácora completa para el admin.

### Fase 5 — Pulidos
14. Importación masiva con validación de duplicados y errores.
15. Respaldo manual (export total JSON) — el respaldo automático ya lo hace Lovable Cloud.
16. Confirmaciones obligatorias para acciones críticas.

## Preguntas antes de empezar

1. ¿Construyo **Fase 1 ahora** y vamos validando antes de seguir, o prefieres que avance fases 1–3 de corrido sin pausa?
2. ¿La **foto del producto** y las **fotos de traspaso** las quieres en el bucket existente `checador-photos`, o creo uno nuevo `inventory-photos`?
3. ¿Los **colaboradores** identifican movimientos con su **PIN del reloj checador** (mismo flujo que limpieza/insumos), correcto?
4. ¿El **costo y precio** los maneja la empresa en **MXN** y un solo nivel de precio (no listas por sucursal), correcto?

Confirma estas 4 cosas y arranco con la **Fase 1** completa en el siguiente turno.
