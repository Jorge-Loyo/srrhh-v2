# POST-SPRINT 14 — Migración de funcionalidad legacy: tablas de referencia Dotaneitor

**Fecha:** 2026-09-08 | **Autor:** Agustin + Claude
**Rama:** `deploy` (sin commitear todavía — ver punto 4)

---

## Contexto

Arranca acá un trabajo nuevo, fuera del scope de cualquier sprint numerado: **migrar a v2
funcionalidad que existe en la app vieja (`dotacion-rrhh/`) y todavía no tiene equivalente**. No
es deuda técnica de v2 ni un bug — es features que la app vieja ya resolvía y quedaron afuera del
recorte de sprints 0-14.

Este documento tiene dos partes: (1) el mapeo completo de qué falta migrar, para que sirva de
checklist en sesiones futuras, y (2) el detalle del primer ítem ya resuelto.

---

## 1. Mapa de gaps — app vieja (`dotacion-rrhh`) vs v2 (`srrhh-v2`)

Relevado leyendo `dotacion-rrhh/frontend/src/pages/*` y `dotacion-rrhh/app/src/modules/*`
completos (nombres de archivo + tamaño en líneas) contra `srrhh-v2/apps/{api,web}/src/modules/*`,
verificado con grep que los conceptos no aparecen en ningún lado de v2 (no es solo "página sin
linkear", es funcionalidad ausente).

### Ya migrado / cubierto en v2

| App vieja | Cubre en v2 |
|---|---|
| `cargos/` (alta, lista, kpis) | `cargos`, `kpis` |
| `concursales/` (seguimiento CPH/CEETPS, bajas) | `concursos-cph`, `concursos-ceetps`, `bajas` |
| `herramientas/DotaneitorPage`, `DotacionPadronPage` | `padron` (Dotaneitor migrado a Postgres, Sprint 2) |
| `panel/HomePage` | `inicio` |
| `seguridad/PermisosPage`, `RolesPage`, `UsuariosPage` | `usuarios`, `configuracion` (permisos + jerarquía), `autorizaciones` |
| `seguridad/CargaMasiva*` (diff de padrón) | flujo de aprobación de snapshots de `padron` |
| `herramientas/TablasAdminPage` + `TablasVistaPage` | ✅ **resuelto en este documento** — ver sección 2 |

### Gaps confirmados — sin equivalente en v2 (ni frontend ni backend)

| Módulo viejo | Qué hace | Tamaño | Prioridad sugerida |
|---|---|---|---|
| `organigrama/*` (Home, FlowView, Detalle, Sección, PersonaModal, VacantesModal) | Organigrama visual por hospital/sección (árbol + vista flow) | ~1300 líneas | Media — feature de negocio completa, la data (`personas`+`cargos`) ya existe en v2 |
| `recorridas/RecorridasPage` | CRUD de "minutas" (rich text) por hospital, con permisos por rol (`admin/editor/gerencia` editan, resto lee) | 688 líneas | Media — uso operativo diario |
| `hospitales/*` (HospitalesPage, OrganizacionTablaPage, POUPage, POUComparativaPage) | ABM de hospitales + comparativa de Planta Orgánico-Funcional | — | Media — la API ya tiene módulo `hospitales`, falta el frontend |
| `seguridad/AuditoriaPage` | Visor del log de auditoría | 388 líneas | Baja-Media — el backend ya tiene `AuditLog` (modelo Prisma) y `audit.middleware.ts` escribiendo, falta el visor |
| `seguridad/TokensPage` | Gestión de tokens de API/integraciones | 173 líneas | Baja — confirmar primero si sigue siendo necesario con el esquema de auth JWT actual |

`director/DirectorHomePage` y `concursales/TableroPage` quedaron sin clasificar — hay que
comparar contra `inicio`/`kpis` de v2 antes de decir si son gap real o ya están cubiertos con otro
diseño.

---

## 2. Ítem resuelto: administración de tablas de referencia de Dotaneitor

### Por qué este y no otro

De toda la lista, era el único con antecedente de haber roto algo real en producción (ver
`Dotaneitor_Analisis.md` sección 9, hallazgo 2026-09-02: las tablas `ref_*` se migraron a Postgres
vacías y nadie las cargó, lo que dejó el padrón semanal saliendo con columnas en blanco). Ese
incidente puntual **ya estaba resuelto** antes de este documento (`services/dotaneitor/scripts/seed_referencias.py`
cargó los datos desde el Excel de origen) — lo que quedaba abierto era que, después de esa carga
inicial, **no hay ninguna forma de mantener esos datos desde la UI**: cualquier corrección requiere
que un dev corra un script de Python a mano contra el Excel + la base.

Verificado con grep sobre `apps/api` y `apps/web`: ninguno de los 10 modelos `Ref*` de
`prisma/schema.prisma` (sección "TABLAS DE REFERENCIA (Mapeos Dotaneitor)") tenía una sola línea
de service/route/UI antes de este trabajo.

Conteo real en la base local al momento de arrancar (para referencia futura):

| Tabla | Filas |
|---|---|
| `ref_especialidades_cuil` | 49.231 |
| `ref_unificadores_puesto` | 417 |
| `ref_agrupadores` | 397 |
| `ref_abreviaturas_tecnicas` | 86 |
| `ref_correcciones_lit_puesto` | 34 |
| `ref_especialidad_por_puesto` | 37 |
| `ref_conectores_minuscula` | 16 |
| `ref_sufijos_ordinales` | 14 |
| `ref_abreviaturas_titulo` | 5 |
| `ref_correcciones_especialidad` | 4 |

### Decisiones de arquitectura (tomadas por Agustín antes de escribir código)

1. **Endpoints tipados por tabla**, no un único endpoint genérico con SQL dinámico (que era el
   patrón de la app vieja, `herramientasController.js` — `INSERT INTO \`${tableName}\``, con
   whitelist manual de tablas permitidas). Más código repetido, pero type-safe end-to-end y sin
   riesgo de exponer una tabla nueva sin querer.
2. **Solo rol `admin`** puede editar — son tablas técnicas del pipeline de Dotaneitor, no datos de
   uso diario por las áreas.

### Qué se construyó

**Backend** (`apps/api/src/modules/referencias/`):
- `referencias.schema.ts` — un schema Zod (create + update parcial) por cada una de las 10 tablas.
- `referencias.service.ts` — list paginado (con búsqueda por CUIL/especialidad en
  `especialidades-cuil`, la única tabla con volumen real), create/update/delete contra Prisma.
  Errores de constraint único → 409, registro no encontrado en update/delete → 404.
- `referencias.routes.ts` — 10 recursos × 4 endpoints (`GET/POST /recurso`, `PATCH/DELETE
  /recurso/:id`), montados bajo `/api/v1/referencias`, gateados con
  `requirePermiso({ modulo: 'configuracion', accion: 'gestionar_referencias' })`.
- `scripts/seed_referencias_permisos.sql` — agrega el permiso al catálogo (sin asignarlo a ningún
  `role_permisos`: alcanza con que exista la fila para que `admin` pase, ya que `requirePermiso`
  deja pasar a admin siempre sin necesitar filas en `role_permisos`).

**Frontend** (`apps/web/src/modules/configuracion/`):
- `hooks/useReferencias.ts` — factory de hooks de React Query, instanciada una vez por tabla
  (misma lógica que el backend: tipado por tabla, no genérico por string).
- `pages/ConfiguracionReferenciasPage.tsx` — misma UX que la vieja `TablasAdminPage` (sidebar de
  tablas + panel con paginación, alta/edición/baja con modal), pero con columnas fijas por
  configuración en el código en vez de pedir el schema en runtime vía un endpoint `/erd` — el
  backend nuevo solo expone estas 10 tablas puntuales, no hay forma de pedir una tabla arbitraria.
- Ruta `/configuracion/referencias` + link en el menú (`AppShell.tsx`), mismo permiso.

### Hallazgo técnico lateral: `strict: false` rompe la inferencia de tipos de Zod

Al escribir los `create` de `referencias.service.ts` pasando el objeto completo validado por Zod
directo a `prisma.<tabla>.create({ data: body })`, `tsc` tiraba error en las 10 tablas: el tipo
inferido de Zod aparecía con **todos los campos opcionales**, incluso los declarados sin
`.optional()` en el schema.

Causa raíz confirmada con un test aislado: `apps/api/tsconfig.json` tiene `"strict": false`
(hereda de `../../tsconfig.json` que sí tiene `strict: true`, pero lo pisa). Sin
`strictNullChecks`, la inferencia de tipos de Zod para propiedades requeridas se degrada — es una
limitación conocida de Zod, no un bug de esta sesión. Con `--strict` explícito el mismo schema
mínimo sí marca correctamente la propiedad como requerida.

**Impacto real:** no es exclusivo de este módulo — afecta la inferencia de *cualquier* schema Zod
en `apps/api` cuando se pasa el objeto completo (en vez de listar campos uno por uno) a una función
tipada que espera campos requeridos. El resto del código existente no lo pisa porque construye los
objetos de Prisma listando campos explícitamente (ver `usuarios.service.ts`), no porque el problema
no exista.

**Fix aplicado acá:** en los 10 `create` de `referencias.service.ts` se arma el `data` explícito
campo por campo (mismo patrón que `usuarios.service.ts`), en vez de pasar `body` entero. Sortea el
problema pero no lo arregla de raíz.

**No resuelto a propósito:** activar `strict: true` en `apps/api/tsconfig.json` para arreglarlo de
raíz queda fuera de este documento — es un cambio que probablemente saca a la luz errores nuevos en
código ya existente en todo `apps/api`, y no es algo para tocar de paso en una tarea de migración.
Queda como candidato a un POST-SPRINT propio si el equipo decide priorizarlo.

### Verificación

- `tsc --noEmit` limpio en `apps/api` y `apps/web`.
- Levantada la API local: la ruta nueva responde con el mismo comportamiento RBAC que el resto
  (401 sin token). De paso se encontró y mató un proceso Node viejo (de una sesión de días
  anteriores) que había quedado escuchando en `127.0.0.1:3000` y pisaba las respuestas de la API
  nueva — vale la pena que cualquiera que note comportamiento raro en local revise `ps aux | grep
  node` por procesos colgados de sesiones viejas.
- `scripts/seed_referencias_permisos.sql` corrido contra la base local.
- **No verificado:** alta/edición/baja real desde la UI con login — Postgres dejó de responder en
  `localhost:5432` a mitad de la sesión (estaba arriba minutos antes, corrió sin problema el conteo
  de filas de la tabla anterior). Según `ARRANQUE_LOCAL.md` corre en Docker vía WSL2; probablemente
  Docker Desktop se detuvo o suspendió. Pendiente repetir la prueba end-to-end la próxima vez que
  se retome este trabajo.

---

## 3. Pendiente

| # | Pendiente | Bloqueante |
|---|---|---|
| 1 | Verificar end-to-end (login admin + alta/edición/baja real en cada una de las 10 tablas) | Entorno local — ver sección 4, pasa a Jorge |
| 2 | Correr `scripts/seed_referencias_permisos.sql` también en producción cuando esto se despliegue | No viaja solo con el código, mismo patrón que `seed_autorizaciones_permisos.sql` de Sprint 13 |
| 3 | Commitear y mergear (quedó en `deploy` sin commitear al cierre de esta sesión) | — |
| 4 | Decidir si se prioriza `strict: true` en `apps/api/tsconfig.json` como POST-SPRINT propio | Ver hallazgo técnico arriba |
| 5 | Elegir el próximo ítem de la sección 1 para migrar (organigrama, recorridas, hospitales, auditoría o tokens) | Decisión de negocio, no técnica |

---

## 4. Entorno local — se traba en Docker/Postgres, pasa a Jorge

Intentando retomar la verificación E2E del punto 1 apareció un problema de entorno (no de código)
que no se llegó a resolver del todo en esta sesión — Agustín decidió cortar acá y que lo retome
Jorge, que conoce mejor la parte de infra/Docker de esta máquina.

**Lo que se encontró:**

- Postgres dejó de responder en `localhost:5432` a mitad de la sesión anterior (¿Docker
  Desktop/WSL2 se detuvo o suspendió? No confirmado).
- Al intentar levantar el stack de Docker de nuevo (`docker compose -f docker-compose.yml -f
  docker-compose.override.yml up -d --build` desde WSL), faltaba `docker-compose.override.yml` —
  es un archivo **local, gitignoreado a propósito** (`.gitignore` línea 49, comentario "conflicto
  de puerto con Postgres nativo"), o sea que existió en esta máquina en algún momento pero no viaja
  con el repo. Se recreó con lo mínimo que pide `Doc/ARRANQUE_LOCAL.md` §7 (remapear el Postgres
  del contenedor al puerto **5433** del host, porque el 5432 lo ocupa un Postgres nativo instalado
  acá) — el `CORS_ORIGINS` con 5180 que el doc menciona como parte del override ya está en el
  `docker-compose.yml` base actual, no hizo falta agregarlo de nuevo.
- **Punto importante para quien retome esto:** hay indicios de **dos Postgres distintos en esta
  máquina** — uno nativo en el 5432 (contra el que corrió toda la verificación de este documento:
  conteo de las tablas `ref_*`, el seed del permiso) y el de Docker, que con el override queda en
  el 5433 con su propio volumen (`postgres_data`), posiblemente vacío si es la primera vez que se
  levanta en este checkout. Antes de dar por buena o por rota cualquier prueba, confirmar contra
  cuál de los dos se está corriendo y si tiene los datos esperados (`prisma migrate deploy` +
  `pnpm db:seed` si está vacío, ver `ARRANQUE_LOCAL.md` §3).
- La sesión se cerró con el stack de Docker **apagado** (el usuario cerró todo). No quedó ningún
  proceso ni container corriendo de esta sesión.

**No es nada roto en el código** — ver sección 5 (verificación de que no se rompió nada). Es
puramente "hay que destrabar el entorno Docker/Postgres de esta máquina", tarea para Jorge.

---

## 5. Verificación de que no se rompió nada

Antes de cortar, se confirmó el estado del repo:

- `git status` / `git diff` muestran únicamente los cambios de este trabajo: 4 archivos existentes
  con diffs chicos y puramente aditivos (una línea de import + registro en `app.ts`, un bloque de
  ruta en `router.tsx`, un ítem de menú en `AppShell.tsx`, una fila en `PLAN_SCRUM_2026.md`) más
  los archivos nuevos del módulo (`apps/api/src/modules/referencias/`, hooks y página de
  `configuracion` en el frontend, el script de seed, este documento). **Ningún archivo existente
  fue modificado más allá de esas líneas puntuales** — no hay riesgo de haber tocado algo de otro
  módulo.
- No quedaron scripts temporales sueltos en el repo (se usaron y borraron en el momento:
  `count_refs.mjs`, `run_seed_permiso.mjs`, `_t.mjs`, todos fuera de control de versiones).
- No quedó ningún proceso ni puerto (3000, 5432, 5433) escuchando de esta sesión — se mató
  explícitamente el server de prueba levantado para el smoke test, y de paso un proceso viejo de
  una sesión anterior que estaba pisando el puerto 3000 (ver sección 2, "Verificación").
- `docker-compose.override.yml` es el único archivo tocado por fuera del repo (correctamente
  gitignoreado, no aparece en `git status`) — no afecta a nadie que no esté usando Docker en esta
  misma máquina.

**Conclusión:** el código escrito en este documento (módulo `referencias`, página de
configuración, permiso nuevo) está completo, compila limpio (`tsc --noEmit` en `apps/api` y
`apps/web`) y no interfiere con nada existente. Lo único pendiente es puramente de entorno local
(sección 4) y la verificación E2E que depende de él (punto 1 de la sección 3).
