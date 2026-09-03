# Horario laboral base por colaboradora

Asignar en la pestaña de Colaboradoras el horario laboral de toda la semana (base para todos los meses), y usarlo en el Ranking para medir la puntualidad real de cada una.

## Cómo funcionará

- En Colaboradoras, cada colaboradora tendrá un botón "Horario" que abre una tabla de lunes a domingo.
- Por cada día se define hora de entrada y hora de salida; los días de descanso no requieren horario (el descanso ya se maneja en el módulo Descansos y esos días se ignoran).
- El horario es permanente: aplica a todas las semanas y meses hasta que se cambie.
- Valores por defecto sugeridos al abrir por primera vez, editables.

## Puntualidad en el Ranking

- Hoy la puntualidad usa una hora fija de las 10:00 AM para todas.
- Pasará a comparar cada entrada contra la hora asignada a esa colaboradora ese día de la semana, con **5 minutos de tolerancia**.
- Se excluyen del cálculo los días de descanso (habitual, cambios y domingos bono) y los días sin horario definido.
- El detalle mostrará: % puntual, entradas puntuales / entradas contadas y minutos promedio de retraso.
- Si una colaboradora aún no tiene horario cargado, se sigue usando la regla actual de las 10:00 AM para no romper el ranking.

## Detalles técnicos

1. Migración: tabla `employee_schedules` con `owner_id`, `employee_id` (cascade), `weekday` (0-6), `start_time`, `end_time`, `active`, timestamps, único por (`employee_id`, `weekday`), RLS `auth.uid() = owner_id`, GRANT a `authenticated` y `service_role`, trigger de `updated_at`.
2. `src/lib/schedule.ts`: tipos, carga de horarios por dueño, helper `isOnTime(entrada, horario, tolerancia=5)` y constante `TOLERANCE_MINUTES = 5`.
3. `src/routes/empleadas.tsx`: diálogo "Horario semanal" por colaboradora con 7 filas (día, entrada, salida, activo) y guardado por upsert.
4. `src/routes/ranking.tsx`: reemplazar `ON_TIME_HOUR` fijo por el horario asignado + tolerancia, excluir descansos usando las funciones existentes de `src/lib/rest-days.ts`, y actualizar textos del tablero de puntualidad.
