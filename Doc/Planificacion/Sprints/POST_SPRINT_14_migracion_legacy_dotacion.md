# POST-SPRINT 14 — Migración de funcionalidad legacy: Dotación / Dotación Total

**Fecha:** 2026-09-09 | **Autor:** Agustín + Claude
**Rama:** `deploy` (sin commitear todavía — ver "Pendiente" abajo, ojo con lo que ya había sin commitear ahí)

---

## Contexto

Tercer ítem migrado de `dotacion-rrhh` a v2 (después de Organigrama y tablas de referencia, ver los
otros `POST_SPRINT_14_*.md`): las pantallas **Dotación** y **Dotación Total** del menú viejo, que en
realidad son un solo componente legacy (`DotacionTotalPage.jsx`, ruta `/dotacion`) — tabla paginada
de personal + panel de KPIs + filtros, con un selector de hospital que al vaciarse muestra el total
de todos los hospitales. Se replicó esa misma estructura de página única en v2 (decisión de Agustín),
no dos rutas separadas.

No había nada de esto planificado en ningún sprint — es trabajo nuevo, sin dependencias de schema
(no hizo falta ninguna migración de Prisma: todo se arma sobre `Cargo`/`Ocupacion`/`Persona`/
`Hospital`/`Escalafon`, ya existentes).

## Decisión tomada antes de empezar

`GET /kpis/dotacion` (S6-1, ya existente) **no sirve** para el panel de KPIs de esta pantalla: ese
endpoint cuenta cargos vigentes vs. vacantes por escalafón/hospital (perspectiva de dotación de
*puestos*), mientras que el panel legacy necesita composición del *personal activo* (Activos/
Retención de Cargo/Comisión por `situacion_revista`, Mujeres/Varones por `sexo`, distribución por
escalafón, top efectores). Son conceptos distintos — se armó un endpoint de KPIs propio
(`GET /dotacion/kpis`) en el módulo nuevo, sin tocar `/kpis/dotacion`.

Criterio de "vigente" replicado del resto del proyecto: `Ocupacion.hasta IS NULL` AND
`Cargo.estado = 'vigente'`.

---

## Qué se construyó

### Backend (`apps/api/src/modules/dotacion/`)
- `dotacion.schema.ts` — filtros multi-select como CSV (mismo formato que el legacy), búsqueda
  rápida, rangos edad/antigüedad, `sortBy` validado contra una whitelist fija (primer uso de sort
  dinámico en el proyecto, no había convención previa).
- `dotacion.service.ts` — `listDotacionService` (tabla paginada, join
  `ocupaciones ⋈ personas/cargos/hospitales/escalafones`, con `distinctValues`/
  `siglasDistinctValues` para poblar los multi-select del frontend) y `getDotacionKpisService`
  (panel de KPIs: activos/retención/comisión, mujeres/varones, por escalafón, top efectores).
- `dotacion.routes.ts` — `GET /` y `GET /kpis`, solo `authenticate` (igual que `personas`/`cargos`/
  `kpis` — son lecturas, sin `requirePermiso` a nivel de endpoint).
- Registrado en `apps/api/src/app.ts` bajo `/api/v1/dotacion`.

### Frontend (`apps/web/src/modules/dotacion/`)
- `hooks/useDotacion.ts` — queries a ambos endpoints.
- `components/DotacionKpisPanel.tsx` — panel colapsable, cards de Activos/Retención/Comisión
  clickeables (filtran la tabla por `situacion_revista`, igual que el legacy), distribución por
  escalafón y top efectores.
- `pages/DotacionPage.tsx` — página única: filtros multi-select + búsqueda rápida + selector de
  hospital, tabla ordenable por columna, paginación, export a Excel (página actual y completo, con
  `fetchAllPages`/`downloadExcel` de `shared/lib/exportExcel.ts` — mismo patrón que `PersonasPage`),
  tabla ampliada en modal fullscreen.
- **Componente nuevo reutilizable** `shared/components/ui/MultiSelectDropdown.tsx` — no existía
  ningún multi-select en el proyecto (solo `SearchableSelect` de selección única). Queda disponible
  para otros módulos.
- Ruta `/dotacion` en `router.tsx` (gateada con `RequirePermiso`) + link "Dotación" 🩺 en el menú
  (`AppShell.tsx`, junto a "Personas").

### Permiso nuevo
`dotacion.ver` — `scripts/seed_dotacion_permisos.sql` (mismo patrón que
`seed_organigrama_permisos.sql`/`seed_autorizaciones_permisos.sql`: solo da de alta la fila en
`permisos`, la asignación a roles se hace después desde Configuración → Permisos). **No corrido
todavía en ningún entorno** (ver Pendiente).

### Mapeo de columnas legacy → v2

Documentado completo en el plan de implementación; los puntos no triviales:
- `especialidad` (legacy) → `Cargo.especialidadLegacy` (no `Persona.especialidadPrincipal`) — mismo
  campo que ya usa el resto del proyecto para esto.
- `reparticion` (legacy) → `Cargo.descripcionRepa`.
- `codigo_rol` (legacy) → `Ocupacion.idSialRol`.
- `edad`/`antiguedad` se calculan en SQL (`age()`) a partir de `Persona.fechaNacimiento`/
  `antiguedadDesde`, no son columnas propias.

---

## Verificación hecha

- `tsc --noEmit` limpio en `apps/api` y `apps/web`.
- **No se corrió contra datos reales ni se probó la UI en navegador** — no se levantó el stack en
  esta sesión. Solo verificación de tipos.

---

## Pendiente (para Jorge, antes/durante el merge)

| # | Pendiente | Bloqueante |
|---|---|---|
| 1 | Correr `scripts/seed_dotacion_permisos.sql` en local, y en Neon/producción cuando esto se despliegue — no viaja solo con el código (mismo problema que pasó con `seed_autorizaciones_permisos.sql` en Sprint 13) | Sí — sin esto nadie ve el link "Dotación" ni puede entrar a `/dotacion` |
| 2 | Asignar el permiso `dotacion.ver` a los roles que corresponda desde Configuración → Permisos (no hay ningún rol con el permiso todavía, ni siquiera en local) | Sí, mismo punto que el 1 |
| 3 | Probar contra datos reales / UI real en Docker — esta sesión solo verificó `tsc`, no se levantó el stack. Prestar atención en particular a los ~13 filtros multi-select y a que `distinctValues` no pegue lento con el volumen real (~46k cargos) | No bloqueante para mergear, sí para darlo por terminado |
| 4 | Revisar el mapeo de columnas contra data real (tabla arriba) — especialmente `especialidad`/`reparticion`, puede necesitar ajuste fino una vez que se vea cómo vienen pobladas en Neon | No bloqueante |
| 5 | Sin selector de período (mismo criterio que se usó para Organigrama, ver `POST_SPRINT_14_migracion_legacy_organigrama.md`) — confirmar con Jorge/negocio si hace falta navegación histórica acá también | Decisión de negocio, no bloqueante |
| 6 | Commitear y mergear — **ojo**: en `deploy` había además trabajo sin commitear ajeno a esta tarea (`apps/api/src/modules/pou/`, `apps/web/src/modules/pou/`, migración `20260909120000_pou`, `scripts/seed_pou_permisos.sql`, cambios en `prisma/schema.prisma`) — separar los commits, no mezclar ambos trabajos en uno solo | Sí |
| 7 | No hizo falta ninguna migración de Prisma para este módulo (solo queries sobre tablas ya existentes) — no hay `prisma migrate deploy` pendiente por esto en particular | — |
