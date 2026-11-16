# SPRINT 25 — SGRASV: asignación de siglas, kanban de concursos y mejoras transversales

**Estado:** ✅ Completado
**Autores:** Jorge (backend) + Agustín (frontend)
**Duración estimada:** 1 semana | **Capacidad:** 60h | **Estimado:** ~50h

---

## Objetivo

Dar a SGRASV herramientas de gestión operativa sobre sus supervisores de concursos:
asignar qué hospitales (siglas) atiende cada uno, y un kanban para ver y redistribuir
concursos CPH y CEETPS activos. Dar a los supervisores su propio kanban de seguimiento
por estado. Mejorar la UX de Notificaciones y Autorizaciones con pestañas por tipo.

---

## Contexto y decisiones de diseño

### Roles involucrados — slugs REALES en BD

| Rol | Slug real en BD | Descripción |
|-----|-----------------|-------------|
| SGRASV | `sgrasv_5ac494e` | Rol padre. Ve `/tareas/kanban-sgrasv` + `/tareas/kanban-supervisor` |
| Supervisor de concursos | `supervision_de_concursos_4ff21d6` | Rol hijo. Ve solo `/tareas/kanban-supervisor` |

La jerarquía `supervision_de_concursos_4ff21d6 → sgrasv_5ac494e` **ya está sembrada** en
`role_jerarquias` (script `fix_roles_jerarquia_desde_neon.sql`). No hay que crearla.

### Rutas del frontend

| Ruta | Quién la ve | Descripción |
|------|-------------|-------------|
| `/tareas` | Todos | Lista de tareas pendientes (existente) |
| `/tareas/kanban-sgrasv` | `tareas.ver_kanban_sgrasv` | Panel siglas + kanban de gestión por supervisor |
| `/tareas/kanban-supervisor` | `tareas.ver_kanban_supervisor` | Kanban propio del supervisor por estado |

SGRASV tiene acceso a **ambas** rutas. El supervisor solo a `/tareas/kanban-supervisor`.

### Modelo de asignación de concursos

- **Siglas fijas** (`usuario_siglas`): configuración estable de qué hospitales atiende cada supervisor.
  Define qué concursos ve en su kanban de supervisor.
- **Asignación directa** (`concursos_asignados`): asignación temporal de un concurso puntual a un
  supervisor distinto al "natural" de la sigla. Caso de uso: vacaciones, redistribución de carga.
  No modifica la configuración de siglas. Se puede revertir (`usuario_id = null` → vuelve al pool
  "sin asignar" del kanban de SGRASV).
- **Prioridad de visibilidad**: un supervisor ve los concursos de sus siglas + los que le fueron
  asignados directamente, aunque la sigla no sea suya.
- **Restricción de reasignación**: SGRASV solo puede asignar a roles inferiores en la jerarquía
  (reutiliza `slugsDescendientes` ya existente en `tareas.service.ts`).
- **CPH + CEETPS**: el kanban incluye ambos tipos. `concursos_asignados` usa el patrón
  `referencia_id` + `referencia_tipo` (igual que `Autorizacion` y `TareaPendiente`) en vez de
  una FK directa a `concurso_cph_id`.

### Columnas del kanban de supervisor (CPH y CEETPS unificados)

| Columna | Condición |
|---------|-----------|
| No iniciado | CPH: `estado = no_iniciado` / CEETPS: `estado = sin_autorizar` |
| Pendiente autorización | CPH: `pendienteAutorizacion = true` / CEETPS: `estado = sin_autorizar OR autorizado` |
| En proceso | CPH: `estado = activo AND pendienteAutorizacion = false` / CEETPS: `estado = en_proceso` |
| Finalizado | CPH: `estado IN (finalizado, suspendido)` / CEETPS: `estado IN (finalizado, desierto)` |
| Novedades | `updatedAt >= now() - N días` (N configurable, default 7, persiste en `localStorage`) |

La columna **Novedades** puede solapar con otras — se muestra al inicio como alerta visual.
Los concursos finalizados NO entran en Novedades.

### Badge de días en estado

Calculado desde `updatedAt` del concurso:
- 🟢 Verde: < 7 días
- 🟠 Naranja: 7–30 días
- 🔴 Rojo: > 30 días

---

## Migraciones

### `sprint25_sgrasv_kanban` — dos tablas nuevas

```sql
-- Siglas asignadas a cada supervisor (configuración estable)
CREATE TABLE usuario_siglas (
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitales(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, hospital_id)
);
CREATE INDEX ON usuario_siglas (hospital_id);

-- Asignación directa de un concurso (CPH o CEETPS) a un supervisor (temporal/puntual).
-- PK en (referencia_id, referencia_tipo): un concurso tiene como máximo una asignación activa.
-- usuario_id NULL = sin asignar (devuelto al pool de SGRASV).
-- referencia_tipo: 'concurso_cph' | 'concurso_ceetps'
CREATE TABLE concursos_asignados (
  referencia_id   UUID        NOT NULL,
  referencia_tipo VARCHAR(20) NOT NULL,
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  asignado_por_id UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (referencia_id, referencia_tipo)
);
CREATE INDEX ON concursos_asignados (usuario_id);
```

### Seed de permisos nuevos (script SQL)

La jerarquía ya existe. Solo hay que agregar los 3 permisos nuevos y asignarlos.

```sql
-- Permisos nuevos
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('tareas', 'ver_kanban_sgrasv',     'Ver kanban de gestión de concursos (SGRASV)'),
  ('tareas', 'ver_kanban_supervisor', 'Ver kanban propio de concursos por estado'),
  ('tareas', 'asignar_concurso',      'Asignar o reasignar un concurso a un supervisor')
ON CONFLICT (modulo, accion) DO NOTHING;

-- SGRASV: los 3 permisos
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE p.modulo = 'tareas'
  AND p.accion IN ('ver_kanban_sgrasv', 'ver_kanban_supervisor', 'asignar_concurso')
  AND r.slug = 'sgrasv_5ac494e'
ON CONFLICT DO NOTHING;

-- Supervisor: solo ver_kanban_supervisor
INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id FROM roles r, permisos p
WHERE p.modulo = 'tareas' AND p.accion = 'ver_kanban_supervisor'
  AND r.slug = 'supervision_de_concursos_4ff21d6'
ON CONFLICT DO NOTHING;
```

---

## Tareas — Jorge (backend)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S25-1 | Migración `sprint25_sgrasv_kanban`: tablas `usuario_siglas` + `concursos_asignados` (con `referencia_id`/`referencia_tipo`). Script separado `scripts/seed_sgrasv_permisos.sql` con los 3 permisos nuevos. Modelos Prisma `UsuarioSigla` + `ConcursoAsignado` | 2h | 🔴 Crítico | ✅ |
| S25-2 | Módulo siglas en `usuarios`: `GET /api/v1/usuarios/supervisores` (hijos de `sgrasv_5ac494e` por jerarquía, con siglas expandidas: `{ id, username, nombre, apellido, siglas: [{ hospitalId, sigla, nombre }] }`). `PUT /api/v1/usuarios/:id/siglas` (reemplaza set completo en tx). `GET /api/v1/usuarios/me/siglas`. Guard: `PUT` solo con permiso `tareas.asignar_concurso` | 4h | 🔴 Crítico | ✅ |
| S25-3 | `GET /api/v1/tareas/kanban-sgrasv`: columnas dinámicas, una por supervisor (usuarios con rol `supervision_de_concursos_4ff21d6` + el propio sgrasv). Cada columna: `{ usuario, siglas[], concursos[] }`. Columna extra `sin_asignar`: concursos CPH+CEETPS activos sin fila en `concursos_asignados` (o con `usuario_id = null`). Cada tarjeta: `tipo` (cph/ceetps), `diasSinMovimiento`, `subEstado`/`subEstado3`, `hospital.sigla`, `cargo.codigo`. Guard: `tareas.ver_kanban_sgrasv` | 5h | 🔴 Crítico | ✅ |
| S25-4 | `POST /api/v1/tareas/asignar`: body `{ referenciaId, referenciaTipo, usuarioId \| null }`. Upsert en `concursos_asignados`. `usuarioId = null` devuelve al pool. Validación: si `usuarioId` no es null, debe ser descendiente del usuario logueado (reutiliza `slugsDescendientes`). Guard: `tareas.asignar_concurso` | 2h | 🔴 Crítico | ✅ |
| S25-5 | `GET /api/v1/tareas/kanban-supervisor`: concursos visibles = siglas propias (`usuario_siglas`) UNION asignados directamente (`concursos_asignados.usuario_id = me`), para CPH y CEETPS. Agrupados en 5 columnas (ver tabla arriba). Cada tarjeta: `tipo`, `diasEnEstado`, `colorBadge` (`verde`/`naranja`/`rojo`), `subEstado`, `hospital.sigla`, `cargo.codigo`. Query param `novedadesDias` (int, default 7, máx 90). Guard: `tareas.ver_kanban_supervisor` | 6h | 🔴 Crítico | ✅ |
| S25-6 | `GET /api/v1/autorizaciones/conteo-por-tipo`: devuelve `{ [tipo]: count }` de autorizaciones pendientes del rol del usuario. Necesario para badges de pestañas en D2 | 1h | 🟡 Medio | ✅ |

**Total backend estimado: ~20h**

---

## Tareas — Agustín (frontend)

### Bloque B — Vista SGRASV (`/tareas/kanban-sgrasv`)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S25-B1 | Panel de asignación de siglas en `/tareas/kanban-sgrasv`: tabla de supervisores con columnas Nombre / Siglas asignadas (chips). Botón "Editar" por fila → modal con `SearchableSelect` multi de hospitales. Al guardar llama `PUT /usuarios/:id/siglas`. Hook `useSupervisores` + `useAsignarSiglas` | 6h | 🔴 Crítico | ✅ |
| S25-B2 | Kanban SGRASV en `/tareas/kanban-sgrasv` (debajo del panel de siglas): columnas con scroll horizontal. Una columna por supervisor + columna "Sin asignar" al inicio. Tarjetas CPH y CEETPS con badge de tipo. Badge días sin movimiento (verde/naranja/rojo). Botón "Asignar →" en sin asignar, "Reasignar" + "Liberar" en asignadas. Hook `useKanbanSgrasv` + `useAsignarConcurso` | 8h | 🔴 Crítico | ✅ |

**Total frontend SGRASV: ~14h**

### Bloque C — Vista supervisores (`/tareas/kanban-supervisor`)

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S25-C1 | Kanban supervisor en `/tareas/kanban-supervisor`: 5 columnas fijas, scroll horizontal. Sin drag & drop. Tarjetas CPH y CEETPS con badge de tipo. Badge `diasEnEstado` (verde/naranja/rojo). Input "Días para novedades" (default 7, persiste en `localStorage` clave `kanban_novedades_dias`). Tarjetas en columna Novedades con borde izquierdo destacado. Hook `useKanbanSupervisor(novedadesDias)` | 7h | 🔴 Crítico | ✅ |

**Total frontend supervisores: ~7h**

### Bloque D — Mejoras transversales

| # | Tarea | Est. | Prioridad | Estado |
|---|-------|------|-----------|--------|
| S25-D1 | `NotificacionesPage`: reemplazar `<select>` de tipo por pestañas horizontales. Pestañas: Todas / Autorizaciones / Concursos / Bajas / Vencimientos. Badge de no leídas por categoría calculado client-side. Sin cambios de backend | 3h | 🟡 Medio | ✅ |
| S25-D2 | `AutorizacionesPage`: reemplazar `<select>` de tipo por pestañas. Pestañas: Todas / CPH / CEETPS / Alta de cargo / Baja de cargo. Badge de pendientes por pestaña consumiendo `GET /autorizaciones/conteo-por-tipo` (S25-6). Hook `useConteoPorTipo` | 3h | 🟡 Medio | ✅ |

**Total frontend transversal: ~6h**

---

## Archivos a crear / modificar

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Modelos `UsuarioSigla` + `ConcursoAsignado` |
| `prisma/migrations/20261115000000_sprint25_sgrasv_kanban/migration.sql` | DDL de las dos tablas |
| `scripts/seed_sgrasv_permisos.sql` | 3 permisos nuevos + asignación a roles (jerarquía ya existe) |
| `packages/types/src/index.ts` | Interfaces `UsuarioSigla`, `ConcursoAsignado`, `KanbanSgrasvColumna`, `KanbanSupervisorColumna`, `TarjetaKanban` |
| `apps/api/src/modules/tareas/tareas.service.ts` | `getKanbanSgrasvService`, `getKanbanSupervisorService`, `asignarConcursoService` |
| `apps/api/src/modules/tareas/tareas.routes.ts` | `GET /kanban-sgrasv`, `GET /kanban-supervisor`, `POST /asignar` |
| `apps/api/src/modules/usuarios/usuarios.service.ts` | `getSupervisoresService`, `setSiglasService`, `getMisSiglasService` |
| `apps/api/src/modules/usuarios/usuarios.routes.ts` | `GET /supervisores`, `PUT /:id/siglas`, `GET /me/siglas` |
| `apps/api/src/modules/autorizaciones/autorizaciones.routes.ts` | `GET /conteo-por-tipo` |
| `apps/api/src/modules/autorizaciones/autorizaciones.service.ts` | `conteoPorTipoService` |
| `apps/web/src/router.tsx` (o equivalente) | Rutas `/tareas/kanban-sgrasv` y `/tareas/kanban-supervisor` |
| `apps/web/src/modules/tareas/pages/KanbanSgrasvPage.tsx` | Página nueva: panel siglas + kanban SGRASV |
| `apps/web/src/modules/tareas/pages/KanbanSupervisorPage.tsx` | Página nueva: kanban supervisor |
| `apps/web/src/modules/tareas/hooks/useTareas.ts` | Agregar `useKanbanSgrasv`, `useKanbanSupervisor`, `useAsignarConcurso` |
| `apps/web/src/modules/tareas/hooks/useSupervisores.ts` | Hook nuevo: `useSupervisores`, `useAsignarSiglas` |
| `apps/web/src/modules/tareas/components/KanbanSgrasv.tsx` | Componente nuevo |
| `apps/web/src/modules/tareas/components/KanbanSupervisor.tsx` | Componente nuevo |
| `apps/web/src/modules/tareas/components/PanelSiglas.tsx` | Componente nuevo |
| `apps/web/src/shared/components/layout/AppShell.tsx` | Links en sidebar a las dos rutas nuevas |
| `apps/web/src/modules/notificaciones/pages/NotificacionesPage.tsx` | Pestañas por tipo |
| `apps/web/src/modules/autorizaciones/pages/AutorizacionesPage.tsx` | Pestañas por tipo |
| `apps/web/src/modules/autorizaciones/hooks/useAutorizaciones.ts` | `useConteoPorTipo` |

---

## Dependencias entre tareas

```
S25-1 (migración + seed) ──► S25-2 (siglas API)    ──► S25-B1 (panel siglas)
                         ──► S25-3 (kanban sgrasv)  ──► S25-B2 (kanban sgrasv)
                         ──► S25-4 (asignar)        ──► S25-B2
                         ──► S25-5 (kanban sup.)    ──► S25-C1 (kanban supervisor)
S25-6 (conteo tipo)      ──► S25-D2 (autorizaciones pestañas)
S25-D1 (notif. pestañas) — independiente, puede arrancar en cualquier momento
```

---

## Criterio de éxito

- [x] SGRASV puede asignar y editar las siglas de cada supervisor desde `/tareas/kanban-sgrasv`
- [x] El kanban SGRASV muestra una columna por supervisor + columna "Sin asignar" con todos los concursos CPH+CEETPS activos
- [x] SGRASV puede asignar un concurso puntual a cualquier supervisor (inferior en jerarquía) y revertirlo
- [x] La asignación directa no modifica la configuración de siglas del supervisor
- [x] El kanban supervisor en `/tareas/kanban-supervisor` muestra CPH+CEETPS de las siglas propias + asignados directamente, en 5 columnas
- [x] El badge de días en estado cambia de color según umbral (verde/naranja/rojo)
- [x] La columna Novedades es configurable (input de días, persiste en localStorage)
- [x] `NotificacionesPage` tiene pestañas por categoría con badge de no leídas
- [x] `AutorizacionesPage` tiene pestañas por tipo con badge de pendientes
- [ ] `tsc --noEmit` limpio en `apps/api` y `apps/web` (pendiente verificar en entorno local)

---

## Notas de implementación

- **Slugs reales**: `sgrasv_5ac494e` y `supervision_de_concursos_4ff21d6`. Usar estos en todo el código.
- **Jerarquía ya sembrada**: no hay que crearla. Solo agregar los 3 permisos nuevos.
- **`slugsDescendientes` ya existe** en `tareas.service.ts` — reutilizar para validación en S25-4.
- **`SearchableSelect` ya existe** en `shared/components/ui/` — reutilizar para multi-select de hospitales en S25-B1.
- **Patrón kanban**: columnas con scroll horizontal es nuevo en el proyecto. Definir clases CSS base en `index.css` para reutilizar en ambos kanbans.
- **`novedadesDias`** se pasa como query param al backend (cálculo server-side).
- **Conteos D1**: calcular client-side desde el response de `GET /notificaciones` que ya trae todos los items — agrupar por tipo en el hook antes de renderizar las pestañas.
- **`concursos_asignados` con `referencia_tipo`**: al construir las queries del kanban, hacer dos queries separadas (una para CPH, una para CEETPS) y mergear en el service, o usar un UNION en SQL raw si el ORM lo complica.
