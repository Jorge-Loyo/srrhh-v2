# PLAN SCRUM — SRRHH v2

# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Documento de planificación ágil. Fuente de verdad para sprints, tareas y decisiones de alcance.
> Última actualización: 2026-09 (Sprint 2 Jorge completado y revisado)
>
> 📋 **Gestión de tareas:** [Notion — SRRHH v2](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)

---

## ESTADO ACTUAL

| Sprint                              | Estado        | Completado    |
| ----------------------------------- | ------------- | ------------- |
| Sprint 0 — Infraestructura          | ✅ Completado | S0-1 a S0-11  |
| Sprint 1 — Autenticación            | ✅ Completado | S1-1 a S1-10  |
| Sprint 2 — Dotaneitor + Padrón      | ✅ Completo — verificado end-to-end con datos reales 2026-08-25 | S2-1 a S2-19 (✅) |
| Sprint 3 — Personas y Cargos        | ✅ Completo — verificado con browser real 2026-08-25 | S3-1 a S3-11 (✅) |
| Sprint 4 — Concursos CPH            | ⏳ Pendiente  | —             |
| Sprint 5 — Concursos CEETPS + Bajas | ⏳ Pendiente  | —             |
| Sprint 6 — KPIs + Deploy            | ⏳ Pendiente  | —             |

---

## 1. CONTEXTO DEL EQUIPO

| Parámetro          | Valor                                                |
| ------------------ | ---------------------------------------------------- |
| Equipo             | Jorge (Dev 1 — Backend) + Agustin (Dev 2 — Frontend) |
| Capacidad          | 30h/semana por dev = 60h/semana totales              |
| Duración de sprint | 1–2 semanas según complejidad                        |
| Ceremonia          | Review + Retro semanal                               |
| Herramienta        | Notion                                               |
| Sin daily          | Comunicación asíncrona                               |
| Deadline MVP       | Sin fecha fija — prioridad: calidad por etapa        |

### Definición de Done (DoD)

Un ítem está terminado cuando:

- [ ] Funcionalidad implementada y probada manualmente
- [ ] Sin regresiones en módulos existentes
- [ ] Documentación actualizada (este doc + archivos Doc/)
- [ ] Código en rama `develop` con PR aprobado

---

## 2. ARQUITECTURA DEL SISTEMA

```
SRRHH-Legacy/ (monorepo pnpm + Turborepo)
├── apps/api/          ← Fastify + Prisma + PostgreSQL
├── apps/web/          ← React + Vite + Tailwind (tokens Obelisco GCBA)
├── packages/types/    ← DTOs y enums compartidos
├── packages/utils/    ← Helpers compartidos
├── prisma/            ← Schema + migraciones (fuente de verdad BD)
├── services/
│   └── dotaneitor/    ← Microservicio Python (análisis Sprint 0)
└── docker-compose.yml ← PostgreSQL + API + Web + Dotaneitor
```

### Stack definitivo

| Capa                 | Tecnología                           |
| -------------------- | ------------------------------------ |
| Base de datos        | PostgreSQL 16 (Docker)               |
| ORM                  | Prisma 5.x                           |
| Backend              | Node 20 + TypeScript + Fastify 4     |
| Frontend             | React 18 + Vite 5 + Tailwind CSS     |
| Design system        | Tokens Obelisco GCBA sobre shadcn/ui |
| Estado servidor      | TanStack Query v5                    |
| Estado cliente       | Zustand                              |
| Formularios          | React Hook Form + Zod                |
| Routing              | React Router v7                      |
| Microservicio padrón | Python + FastAPI (Dotaneitor)        |
| Monorepo             | pnpm workspaces + Turborepo          |
| Contenedores         | Docker + docker-compose              |

---

## 3. ALCANCE MVP

### Dentro del alcance

- Infraestructura base: Docker, PostgreSQL, API, Web
- Dotaneitor integrado: procesamiento semanal del padrón Excel
- Padrón semanal: carga, diff, validación y aprobación
- Personas y cargos: visualización y búsqueda
- Seguimiento concursos CPH (Ley 6.035)
- Seguimiento concursos CEETPS — ENF, TEC, EG
- Bajas consolidadas conectadas al flujo concursal
- Tablero de KPIs de dotación y concursales
- Autenticación con roles

### Fuera del alcance (primera etapa)

- Portal Postulante
- Integración API TAD (manual)
- Firma digital
- Integración Hacienda (manual)
- Integración con otros sistemas GCBA

### Actores del sistema

| Actor               | Rol                                                | Ejemplos                 |
| ------------------- | -------------------------------------------------- | ------------------------ |
| admin               | Configuración, usuarios, carga masiva              | Agus, Jorge              |
| editor              | Lectura + escritura en todos los módulos           | Lucas y equipo           |
| director y usuarios | Solo lectura de su de nicho                        | Autoridades Superiores   |
| concursales_cph     | Lectura total + escritura concursos CPH y bajas    | Alexis, Rijana e eequipo |
| concursales_ceetps  | Lectura total + escritura concursos CEETPS y bajas | Alexi, Laura e Equipo    |

---

## 4. SPRINTS

---

### SPRINT 0 — Infraestructura base + análisis Dotaneitor

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Entorno de desarrollo 100% funcional y Dotaneitor documentado.

| #     | Tarea                                                                  | Dev     | Est. | Prioridad  |     |
| ----- | ---------------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S0-1  | Levantar PostgreSQL con Docker (WSL), verificar conexión               | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S0-2  | Ejecutar `prisma migrate dev` — primera migración                      | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S0-3  | Verificar que API arranca y responde `/health`                         | Jorge   | 1h   | 🔴 Crítico | ✅  |
| S0-4  | Verificar que Web arranca y muestra LoginPage                          | Agustin | 1h   | 🔴 Crítico | ✅  |
| S0-5  | Leer y documentar código Dotaneitor: endpoints, lógica, inputs/outputs | Agustin | 8h   | 🔴 Crítico | ✅  |
| S0-6  | Mapear columnas del Excel de padrón → campos del schema Prisma         | Agustin | 4h   | 🔴 Crítico | ✅  |
| S0-7  | Identificar deuda técnica y optimizaciones del Dotaneitor              | Agustin | 4h   | 🟡 Medio   | ✅  |
| S0-8  | Crear `services/dotaneitor/` con Dockerfile y README                   | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S0-9  | Seed de datos de prueba: hospitales, escalafones, usuario admin        | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S0-10 | Documentar hallazgos Dotaneitor en `Doc/Dotaneitor_Analisis.md`        | Agustin | 3h   | 🟡 Medio   | ✅  |
| S0-11 | Configurar GitHub Actions: lint + build en PR                          | Jorge   | 3h   | 🟢 Bajo    | ✅  |

**Criterio de éxito:**

- `docker-compose up` levanta PostgreSQL, API y Web sin errores
- `GET /health` responde `{ status: 'ok' }`
- LoginPage visible en `http://localhost:5173`
- Dotaneitor documentado: sabemos exactamente qué hace, qué recibe y qué devuelve
- Documento `Doc/Dotaneitor_Analisis.md` completo

---

### SPRINT 1 — Autenticación + usuarios + seed real

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Login funcional con roles, usuarios reales en BD.
**Estado:** ✅ Completado

> **Nota:** S1-8 (seed hospitales/escalafones/admin) fue adelantado y completado en Sprint 0 como S0-9.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |     |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S1-1  | Completar `auth.service.ts`: login con bcrypt + JWT           | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S1-2  | Refresh token: rotación + detección de reutilización          | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S1-3  | Endpoint `POST /api/v1/auth/logout` — revocar token           | Jorge   | 2h   | 🔴 Crítico | ✅  |
| S1-4  | Middleware `authenticate` + `requireRole` integrados en rutas | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S1-5  | CRUD usuarios: listar, crear, activar/desactivar (solo admin) | Agustin | 6h   | 🔴 Crítico | ✅  |
| S1-6  | LoginPage: conectar con API real, manejo de errores           | Agustin | 3h   | 🔴 Crítico | ✅  |
| S1-7  | ProtectedRoute: redirigir a /login si no autenticado          | Agustin | 2h   | 🔴 Crítico | ✅  |
| S1-8  | Seed: hospitales reales + escalafones + usuario admin inicial | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S1-9  | Página Admin/Usuarios: tabla + formulario crear usuario       | Agustin | 6h   | 🟡 Medio   | ✅  |
| S1-10 | Audit log: middleware registra toda escritura automáticamente | Jorge   | 3h   | 🟡 Medio   | ✅  |

**Criterio de éxito:**

- Login con usuario/contraseña real funciona end-to-end
- Refresh token rota correctamente
- Admin puede crear usuarios con roles
- Toda escritura queda en `audit_logs`

**Hallazgos de revisión (Agustin, 2026-08-24 — revisión completa de Sprint 1 ya cerrado):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`audit_log` nunca escribía nada.** `app.ts` registraba `auditLog` como hook `preHandler` a nivel raíz, y Fastify corre los hooks de raíz *antes* que los `preHandler` de cada plugin de rutas (donde vive `authenticate`, quien recién ahí popula `request.user`). Resultado: `request.user` siempre era `undefined` cuando `auditLog` corría, así que el `if (!user) return` cortaba en el 100% de las requests desde que se implementó — pese a estar marcada ✅. Verificado empíricamente con logs en el servidor real. | 🔴 Alta | ✅ **Corregido** — `auditLog` pasó de `preHandler` a `onResponse` en `app.ts` (para ese punto del ciclo de vida todos los `preHandler`, incluidos los de plugins anidados, ya terminaron). Re-verificado: `request.user` llega poblado. |
| 2 | **Race condition teórica en la rotación de refresh token** (`auth.service.ts:refreshTokenService`). Lee el token, chequea `revocado`, y recién después lo marca revocado — son pasos separados, no atómicos. Si el mismo refresh token llega dos veces casi simultáneo (dos tabs, bug de cliente), ambas requests podrían pasar el chequeo antes de que ninguna confirme la revocación, rotando el mismo token dos veces y debilitando la garantía de "un solo uso". | 🟡 Media | ✅ **Corregido** — `updateMany WHERE revocado = false` atómico: solo la primera request actualiza la fila; la segunda no encuentra nada que actualizar y cae en el bloque de revocación de familia. |
| 3 | **Timing side-channel menor en el login** (`auth.service.ts:loginService`). Si el usuario no existe, la función devuelve rápido (sin `bcrypt.compare`); si existe pero la contraseña es incorrecta, corre bcrypt (~100ms). En teoría permite distinguir usuarios válidos por el tiempo de respuesta. | 🟢 Baja | ✅ **Corregido** — siempre se corre `bcrypt.compare` contra un hash dummy cuando el usuario no existe, igualando el tiempo de respuesta. |
| 4 | **Multi-tab**: el `refreshToken` vive en `localStorage` (compartido entre pestañas del mismo origen), pero cada pestaña tiene su propio estado de módulo en memoria (`useAuth`/`api-client`, sin coordinación entre pestañas). Si dos pestañas refrescan casi al mismo tiempo, podría dispararse la detección de reutilización de tokens y cerrar sesión en ambas. | 🟢 Baja | ⏳ **Limitación conocida**, trade-off ya aceptado junto con la decisión de usar `localStorage` en vez de cookie httpOnly (ver nota de S1-6/S1-7 más arriba en el historial de trabajo). Se resolvería con `BroadcastChannel` o eventos de `storage` para coordinar pestañas — no priorizado por ahora. Agregado al backlog como B-9. |

---

### SPRINT 2 — Dotaneitor optimizado + integración padrón

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Dotaneitor optimizado y conectado al flujo de padrón de SRRHH v2.

> **Ver `Doc/Dotaneitor_Analisis.md`** (secciones 6 y 7 para el mapeo de columnas y la deuda
> técnica de Sprint 0; sección 4.1 para los pasos 14-17 y sección 6.4 para la propuesta de campos
> nuevos en Persona/Cargo/Ocupacion, agregados el 2026-08-21 — nuevos requisitos de Agustin, ya
> acordados con Jorge en lo arquitectónico, que dan origen a S2-13 a S2-17 abajo).

| #     | Tarea                                                                     | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------------------- | ------- | ---- | ---------- |
| S2-1  | Aplicar optimizaciones identificadas en Sprint 0 al Dotaneitor            | Agustin | 12h  | 🔴 Crítico | ✅ 8/9 — queda solo #5 (staleness de `MAPEO_ESPECIALIDAD_POR_PUESTO`), informativo, sin acción pendiente |
| S2-2  | Endpoint `POST /api/v1/padron/upload`: recibe Excel, crea snapshot        | Jorge   | 6h   | 🔴 Crítico | ✅ |
| S2-3  | Integración Node → Python: enviar archivo, recibir diff                   | Jorge   | 8h   | 🔴 Crítico | ✅ |
| S2-4  | Guardar `padron_diff` en BD con resultado del Dotaneitor                  | Jorge   | 4h   | 🔴 Crítico | ✅ |
| S2-5  | Endpoint `GET /api/v1/padron/snapshots/:id/diff` paginado                 | Jorge   | 4h   | 🔴 Crítico | ✅ |
| S2-6  | Endpoint `POST /api/v1/padron/snapshots/:id/aprobar`                      | Jorge   | 8h   | 🔴 Crítico | ✅ |
| S2-7  | Lógica de aprobación: actualizar ocupaciones, personas, cargos, historico | Jorge   | 10h  | 🔴 Crítico | ✅ |
| S2-8  | Endpoint `POST /api/v1/padron/snapshots/:id/rechazar`                     | Jorge   | 2h   | 🔴 Crítico | ✅ |
| S2-9  | PadronPage: subir archivo + ver estado del job                            | Agustin | 8h   | 🔴 Crítico | ✅ |
| S2-10 | PadronDiffPage: tabs Nuevos / Modificados / Eliminados                    | Agustin | 10h  | 🔴 Crítico | ✅ (ruta directa por URL — entrada vía lista llega con S2-9) |
| S2-11 | Badge en header cuando hay snapshot pendiente                             | Agustin | 2h   | 🟡 Medio   | ✅ |
| S2-12 | Bloqueo: no se puede subir nuevo archivo con snapshot pendiente           | Jorge   | 2h   | 🔴 Crítico | ✅ |
| S2-13 | Schema: 7 tablas `ref_*` nuevas — `ref_abreviaturas_tecnicas`, `ref_abreviaturas_titulo`, `ref_correcciones_lit_puesto`, `ref_correcciones_especialidad`, `ref_especialidad_por_puesto`, `ref_conectores_minuscula`, `ref_sufijos_ordinales` | Jorge | — | 🔴 Crítico | ✅ |
| S2-14 | Schema: catálogos `Especialidad` y `Puesto` como tablas de apoyo (sin FK desde `Cargo` — texto libre se mantiene); Dotaneitor escribe directo en catálogos de bajo riesgo | Jorge | — | 🔴 Crítico | ✅ |
| S2-15 | Campo `Especialidad.prioritaria Boolean @default(false)` | Jorge | — | 🟡 Medio | ✅ |
| S2-16 | Campos `archivoResultadoPath` y `archivoCalidadPath` en `PadronSnapshot` | Jorge | — | 🟡 Medio | ✅ |
| S2-17 | Schema: 7 campos nuevos en `Persona` (contacto/domicilio/antigüedad), 7 en `Cargo` (repartición/clasificaciones SIAL), 19 en `Ocupacion` (jefatura/comisión/bloqueo/documentación/`diasGuardia String[]`) | Jorge | — | 🟡 Medio | ✅ |
| S2-18 | Upload async: `POST /upload` dispara pipeline en background y devuelve inmediato con `snapshotId`. `EstadoSnapshot` con `procesando`/`error`. Campo `pasoActual` para progreso granular. `GET /snapshots/:id/estado` para polling. Cleanup al arrancar. | Jorge | 4h | 🔴 Crítico | ✅ |
| S2-19 | Dotaneitor migrado de MySQL a Postgres (SQLAlchemy). Decisión arquitectural: diff calculado por Node (Opción B). `/diff`, `/guardar-bd`, `/historial` eliminados. `calcularDiff()` en Node pagina `/preview` y compara contra Cargo+Ocupacion en Postgres. | Jorge | 8h | 🔴 Crítico | ✅ |

> S2-2 a S2-8 y S2-12 a S2-17 completados por Jorge (commit `0c9d49e`). S2-10 y S2-11 completados y
> verificados por Agustin (2026-08-24). S2-19 completado por Jorge (commit `8031bbf`): Dotaneitor
> migrado a Postgres, diff calculado por Node. S2-18 completado por Jorge (commit `b30cfa0`): upload
> async, estados `procesando`/`error`, `pasoActual`, endpoint de polling, cleanup al arrancar.
> S2-9 completado y verificado por Agustin (2026-08-24): `PadronPage` (formulario de subida
> admin/editor, barra de progreso con polling a `/estado` traduciendo `pasoActual` a texto amigable,
> manejo de `estado: error` con `errorMsg`, historial de snapshots), reemplaza el `Placeholder` en
> `router.tsx`. De paso se agregaron los botones Aprobar/Rechazar a `PadronDiffPage` (llaman a
> `POST /snapshots/:id/aprobar` y `/rechazar`, solo visibles para admin/editor y solo con snapshot
> `pendiente`) — sin esto el criterio de éxito "subir → ver diff → aprobar → datos en BD" no era
> alcanzable desde la UI aunque cada tarea individual estuviera ✅. Verificado con Chrome headless vía
> CDP (red mockeada): flujo feliz completo (subida → progreso → pendiente → link a diff → aprobar →
> vuelta al listado), escenario de error (corta el polling, muestra `errorMsg`), rol viewer (sin
> formulario de subida ni botones de decisión), rechazar. Sin errores de consola en ningún caso.
> `tsc --noEmit` limpio en `apps/web` y `apps/api`.

### ✅ Sprint 2 cerrado — y verificado corriendo de verdad (2026-08-25)

Todas las tareas completas (S2-1 a S2-19). S2-1 quedó en 8/9 hallazgos resueltos — el restante
(staleness de `MAPEO_ESPECIALIDAD_POR_PUESTO`) es informativo, sin acción pendiente.

El 2026-08-25 se corrió el flujo completo contra Docker + Postgres real + un padrón real
(47.203 filas), tal como pedía la advertencia del hallazgo #1 de la revisión de Agustin más abajo.
Aparecieron 4 bugs adicionales que solo se manifestaban en runtime (uno en el upload, uno en
Dotaneitor, dos en la aprobación — uno de ellos silencioso, sin excepción, `aprobar` devolvía
200 OK sin haber creado ninguna persona ni ocupación) — los cuatro corregidos y el flujo completo
(upload → diff → aprobar) confirmado funcionando de punta a punta con conteos reales verificados
en la BD (45.083 personas, 46.889 cargos/ocupaciones/histórico). Detalle completo en la tabla
"Verificación end-to-end real" al final de esta sección.

**Criterio de éxito:**

- Flujo completo: subir Excel → ver diff → aprobar → datos en BD — ✅
- Dotaneitor optimizado y documentado — ✅
- `padron_historico` se popula correctamente al aprobar — ✅ (S2-7, Jorge)
- Bloqueo de doble carga funciona — ✅ (S2-12, Jorge)
- Sin datos hardcodeados en Dotaneitor: abreviaturas, correcciones y mapeos viven en tablas `ref_*` — ✅ (S2-13, Jorge)
- Cada corrida de padrón queda archivada (Excel resultado + reporte de calidad) y es descargable después — ✅ (S2-16, Jorge)

**Hallazgos de revisión (Jorge, Sprint 2 — revisión completa post-implementación):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`refreshTokenService`: ventana de inconsistencia** — `updateMany` atómico + `findUnique` separados: si el `findUnique` fallaba después del `updateMany`, el token quedaba revocado pero el usuario recibía 401 sin poder continuar. | 🟡 Media | ✅ **Corregido** — ambas operaciones envueltas en `$transaction` atómica. |
| 2 | **`padronRoutes` sin `requireRole`** — cualquier usuario autenticado (incluso `viewer`/`director`) podía subir, aprobar o rechazar un padrón. | 🟡 Media | ✅ **Corregido** — `requireRole([ADMIN, EDITOR])` agregado como `preHandler` en `POST /upload`, `POST /aprobar`, `POST /rechazar`. |
| 3 | **`throw { statusCode: 400 }` objeto literal** en `padron.routes.ts` — el `errorHandler` no lo reconocía y devolvía 500 en vez de 400. | 🟡 Media | ✅ **Corregido** — reemplazado por `AppError.badRequest('Archivo requerido')`. |
| 4 | **`auditLog`: `entidadId` incorrecto para rutas anidadas** — `parts[4]` devolvía `'snapshots'` en vez del UUID para `/api/v1/padron/snapshots/:id/aprobar`. | 🟢 Baja | ✅ **Corregido** — regex UUID para encontrar el ID en cualquier posición de la URL. |
| 5 | **N queries de catálogo en `aprobarSnapshotService`** — `findUnique` de hospital/escalafón por cada registro nuevo, sin caché. | 🟢 Baja | ✅ **Corregido** — `hospitalCache` y `escalafonCache` (`Map`) antes del loop. |
| 6 | **`idSialRol.split('-')[0]`** — frágil si el formato cambia o si `idSial` contiene guiones. | 🟢 Baja | ✅ **Corregido** — `cargoId` obtenido desde `tx.ocupacion.findUnique({ where: { idSialRol } })` (FK directa). |
| 7 | **`refreshExpiresAt` no soporta `'s'`** — regex `[dhm]` no incluía segundos, rompía tests de integración con expiración rápida. | 🟢 Baja | ✅ **Corregido** — regex extendida a `[dhms]`. |

**Hallazgos de revisión (Agustin, sobre S2-18/S2-19 de Jorge — 2026-08-24):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`services/dotaneitor/main.py` tenía DOS `app = FastAPI(...)` de nivel de módulo** (línea 59 la nueva, línea 618 la vieja) — el commit de S2-19 agregó el código migrado a Postgres pero nunca borró el archivo original de antes de la migración, solo lo dejó pegado después. En Python, la segunda asignación de `app` pisa a la primera: **`uvicorn main:app` corría el objeto viejo**, con las 11 rutas viejas basadas en `mysql.connector` (que ni siquiera tiene variables de conexión configuradas en `docker-compose.yml`) — y `/diff`, `/guardar-bd`, `/historial`, `/ultima-actualizacion`, que se suponía habían sido eliminados, seguían activos. Todo el trabajo de S2-19 (`DotacionAutomationBD` con SQLAlchemy/Postgres, las rutas nuevas) quedaba registrado en un `app` huérfano, nunca sirviéndose. No se detecta revisando el diff línea por línea (la lógica nueva era correcta en sí misma) — solo corriendo el archivo real o buscando duplicados de nivel de módulo. | 🔴 **Alta** — invalidaba S2-19 en runtime pese a verse correcto en el código | ✅ **Corregido** — se borró la sección vieja completa (antes línea 557 en adelante, ~1000 líneas: `import mysql.connector`, el segundo `app = FastAPI`, `/diff`, `/guardar-bd`, `/historial`, `/ultima-actualizacion`, `COL_MAP`). El archivo quedó en 556 líneas, un solo `app`, 11 rutas, 0 referencias a `mysql`. Verificado con `ast.parse` + `py_compile`. |
| 2 | **`runPipeline()` sobreescribe `totalRegistros`** con el conteo del diff (`totalNuevos + totalEliminados + totalModificados`) al terminar con éxito, en vez de dejar el valor original (filas del Excel subido, fijado una sola vez al crear el snapshot). `PadronDiffPage.tsx` muestra ese campo como "X registros procesados" asumiendo que es el conteo del archivo — con el bug, muestra el conteo del diff en su lugar, un dato distinto. | 🟢 Baja | ✅ **Corregido** — se sacó la sobreescritura de `totalRegistros` de la transacción final de `runPipeline()` en `padron.service.ts`. |

Revisado también en detalle sin encontrar problemas: la construcción de `idSialRol` en `calcularDiff()` (usa `cuilYRol` completo en vez de solo el número de rol — distinto a lo documentado en `Dotaneitor_Analisis.md` §6.3, pero internamente consistente entre creación y lectura, no rompe nada), y el manejo de errores/estados de `runPipeline()` (marca `error` correctamente ante cualquier falla del pipeline).

⚠️ **Importante para Jorge:** el hallazgo #1 significa que hasta este fix, S2-19 nunca corrió de verdad en ningún entorno donde se haya levantado el servidor — vale la pena que lo confirme corriendo `docker-compose up` y probando el flujo completo una vez que traiga este cambio.

**Revisión completa de Sprint 2 — Agustin, 2026-08-24 (tareas propias y de Jorge):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`aprobarSnapshotService` sin timeout de transacción, con hasta 6 queries secuenciales por fila** (código de Jorge, S2-6/S2-7). `prisma.$transaction(...)` sin `{ timeout }` usa el default de Prisma — confirmado en `@prisma/client@5.22.0/runtime/library.d.ts`: `maxWait ?= 2000, timeout ?= 5000`. El loop original hacía entre 4 y 6 round-trips secuenciales a Postgres por cada `idSialRol` cambiado (hospital, escalafón, persona, cargo, ocupación + 2 más para histórico). Con eso, cualquier diff no trivial excede los 5s y hace rollback total (`P2028`). Grave en particular porque **la primera aprobación contra un Postgres recién migrado dispara esto siempre**: `calcularDiff()` compara contra `Cargo` (vacío al inicio) y marca *todo* el padrón como "nuevo" — hasta ~48k filas (volumen ya establecido en Sprint 0). Rompía el criterio de éxito central del sprint en el primer uso real. El `errorHandler` tampoco reconoce `PrismaClientKnownRequestError`, así que el fallo llegaba al frontend como 500 genérico sugiriendo "reintentar", cuando reintentar da el mismo resultado siempre. | 🔴 **Crítica** | ✅ **Corregido** — reescrita para precargar en bloque (una query total, no una por fila) todo lo que antes se buscaba fila por fila, crear en bloque con `createMany` (troceado en lotes de 2000 para no pasarse del límite de parámetros de Postgres) en vez de un `create` por fila, batchear `eliminados` en un solo `updateMany` con `idSialRol: { in: [...] }`, y batchear el histórico con un `createMany` final en vez de un `create` por fila. "modificado" queda por fila (cada una cambia campos distintos, no se puede expresar como un único `updateMany`) pero sin el `find` extra que tenía antes. Se agregó además `{ timeout: 10min, maxWait: 10s }` como margen de seguridad. El mismo troceado se aplicó al `padronDiff.createMany` de `runPipeline()` (mismo riesgo de límite de parámetros con un diff de ~48k filas). Verificado con un harness en memoria (mock de `tx`, sin Postgres real disponible) cubriendo: dedup de hospital/escalafón/persona nuevos referenciados por múltiples filas del mismo lote, una persona con dos altas simultáneas, eliminado y modificado sobre datos preexistentes, e histórico con una fila por cada `idSialRol` tocado — 17/17 aserciones OK. |
| 2 | **S2-14 marcada ✅ pero la mitad del comportamiento descripto no existe.** La tarea dice "Dotaneitor escribe directo en catálogos de bajo riesgo" (tablas `Especialidad`/`Puesto`) — el schema está (S2-13/14), pero no hay ningún código, ni en `services/dotaneitor/*.py` ni en la API (`prisma.especialidad`/`prisma.puesto`), que escriba en esas tablas. Tampoco hay seed. Quedaron como catálogos fantasma: creados pero nunca poblados por nadie, y `Especialidad.prioritaria` (S2-15) queda inerte por la misma razón. | 🟡 Media | 📋 **Documentado, sin acción por ahora** — nada más depende todavía de que estas tablas tengan datos, se retoma cuando alguna tarea futura las necesite de verdad. Si Jorge tiene contexto de por qué quedó así (¿decisión consciente de postergarlo?), vale la pena que lo sume acá. |
| 3 | **`prisma generate` nunca se había vuelto a correr después de la última reinstalación de `node_modules`** de esta sesión (mencionada en el historial de Sprint 1/2 al arreglar los symlinks rotos de `@turbo`/`@esbuild`) — pnpm resuelve `@prisma/client` a un stub sin generar (`PrismaClient: any`, literalmente el placeholder que trae el paquete antes de generar) en vez del cliente real. Efecto doble: (a) en runtime, la API **no podía arrancar** (`Error: @prisma/client did not initialize yet`) — verificado ejecutando el server real, no es teórico; (b) en compile-time, cualquier código que dependa de inferencia de tipos de Prisma en un contexto de destructuring (`Promise.all`) caía a `{}` en vez de tirar error real, así que `tsc --noEmit` venía dando falsos positivos de "limpio" en código que en verdad no tenía type-safety sobre Prisma. No es un bug de código de nadie — es un paso de setup que faltaba automatizar. | 🔴 Alta (bloqueaba arrancar la API) | ✅ **Corregido** — se corrió `prisma generate` (quedó bien generado esta vez) y se agregó `"postinstall": "prisma generate --schema=./prisma/schema.prisma"` al `package.json` raíz para que no vuelva a pasar después de un `pnpm install` limpio. Con el cliente real generado, `tsc --noEmit` volvió a correr (ahora sí) contra los tipos reales y encontró 2 errores genuinos en el fix del hallazgo #1 (`.filter(Boolean)` no angosta `string | undefined` a `string` en TS) — ya corregidos. El resto de la API (`auth.service.ts`, `usuarios.service.ts`, etc.) sigue limpio bajo los tipos reales. |

**Verificación end-to-end real (Jorge + Claude, 2026-08-25) — respondiendo a la advertencia del hallazgo #1 de Agustin de arriba ("vale la pena que lo confirme corriendo `docker-compose up` y probando el flujo completo"):**

Se corrió el stack completo en Docker (WSL, Docker Desktop) contra Postgres real y se subió un padrón real (`Cargos_salud_20260802.xlsx`, 47.203 filas) por la API, no un mock. Aparecieron **4 bugs adicionales que ningún review de código había detectado** porque solo se manifiestan corriendo el flujo real de punta a punta — mismo patrón que el hallazgo #1 de Agustin (uno de ellos, el #4, ni siquiera tira error: devuelve 200 OK y hace `COMMIT` sin haber hecho la mitad del trabajo):

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`POST /upload` se colgaba indefinidamente** (`padron.routes.ts`) — el handler itera `request.parts()` con `for await` y para el part de tipo `file` solo guardaba la referencia (`file = part`) sin consumir el stream; `file.toBuffer()` se llamaba recién después, dentro de `uploadPadronService`, fuera del loop. Gotcha conocido de `@fastify/multipart`: si el stream de un `file` part no se drena mientras está activo en el iterador, `busboy` no puede avanzar al siguiente part — y como el archivo es la última parte del multipart, el `for await` nunca termina. La request quedaba colgada sin loggear error ni completar (confirmado: 10+ min sin respuesta, Dotaneitor sin recibir ni `POST /session` ni `POST /upload-cargos`, cero llamadas en sus logs). | 🔴 **Crítica** — invalidaba S2-2/S2-3/S2-18 en runtime (el upload async nunca llegaba a dispararse) | ✅ **Corregido** — se resuelve `part.toBuffer()` inline dentro del loop, apenas se detecta el part de tipo `file`, y se pasa el buffer ya resuelto (no el `MultipartFile` crudo) a `uploadPadronService`. |
| 2 | **Pipeline de Dotaneitor crasheaba en el paso `procesar`** (`Dotaneitor.py:196`) al ajustar `AGRUPADOR` para `COD_SIT=32`. La columna se crea con `df['AGRUPADOR'] = df['CRUCE_AGRUPADOR'].map(agrupador_map)`; si para el archivo real ningún cruce matcheaba la tabla de referencia (o los matches daban NaN), pandas infería la columna entera como `float64`. La línea siguiente intenta escribir el string `'Enfermero/a ATP'` en esa columna — pandas moderno ya no hace el upcast implícito `float64→object` y tira `TypeError` (`LossySetitemError`), tumbando todo el job en Python. El reporte de calidad que ya existe para esto (`agrupador_no_encontrado`, `detalle_sin_agrupador`, sección 292/303 del archivo) nunca llegaba a generarse porque el crash pasaba antes. | 🔴 **Crítica** — bloqueaba el paso `procesar` con cualquier padrón real | ✅ **Corregido** — `.astype('object')` explícito sobre la columna recién mapeada, antes de la asignación condicional. No cambia ningún valor, solo garantiza que la columna pueda contener strings. |
| 3 | **`aprobarSnapshotService` fallaba con `P2000` ("value too long for column type")** al crear un `Escalafon` nuevo — `tx.escalafon.create({ data: { codigo: nombre, nombre } })` reutiliza el nombre completo del escalafón como `codigo`, pero `Escalafon.codigo` es `VARCHAR(20)` en el schema (`Escalafon.nombre` es `VARCHAR(100)`). Cualquier nombre de escalafón real de más de 20 caracteres rompía el `create` y hacía rollback total de la transacción de aprobación (confirmado: 0 filas en `personas`/`cargos`/`ocupaciones`/`historico` tras el rollback, pese a que el diff se había calculado bien — 46.889 "nuevo"). `codigo` no se lee en ningún otro lugar del repo (confirmado por grep) — el lookup de esta misma función es por `nombre`, no por `codigo`. | 🔴 **Crítica** — bloqueaba el `aprobar` en el primer uso real, exactamente el mismo patrón de "primera aprobación contra Postgres recién migrado" que el hallazgo #1 de arriba, pero en un punto distinto del código | ✅ **Corregido** — `codigo` ahora se genera como `nombre.slice(0, 12) + '-' + randomUUID().slice(0, 7)` (20 caracteres exactos, único, no depende de la longitud del nombre real). |
| 4 | **`aprobarSnapshotService` nunca creaba personas ni ocupaciones — falla silenciosa, sin excepción, `aprobar` devolvía 200 OK igual.** `calcularDiff()` guarda `cuil_y_rol` ("`<CUIL 11 dígitos>-<rol>`") en el JSON de cada diff "nuevo" — nunca un campo `cuil` suelto. `aprobarSnapshotService` leía `datos.cuil` (inexistente, siempre `undefined`) en 3 puntos: para armar `cuilsNecesarios` de la precarga, para el guard que decide si crear una `Persona` nueva, y para buscar la `persona` al armar cada `Ocupacion`. Con `datos.cuil` siempre `undefined`, `personasACrear` y `ocupacionesACrear` quedaban **siempre vacíos** — 0 personas, 0 ocupaciones, y por lo tanto 0 histórico (que se arma leyendo las ocupaciones recién creadas). `cargosACrear` sí funcionaba (usa `datos.id_sial`, un campo que sí existe), así que la transacción hacía `COMMIT` con 46.889 `cargos` creados y **0 en todo lo demás**, sin ningún error — el fix del hallazgo #3 de arriba (el `P2000` de Escalafon) fue lo que destapó esto: al dejar de romper, el `aprobar` "funcionaba" (200 OK) pero silenciosamente no hacía la mitad del trabajo. Se detectó recién comparando conteos reales en la BD contra lo esperado, no por ningún error en logs. | 🔴 **Crítica** — invalidaba el criterio de éxito central del sprint ("datos reales cargados") pese a un 200 OK limpio; el bug más peligroso de los 4 porque no se manifiesta como error | ✅ **Corregido** — nueva función `cuilDe(datos)` que deriva el CUIL puro desde `cuil_y_rol` (`.split('-')[0]`), usada en los 3 puntos que antes leían `datos.cuil`. |

Con los 4 fixes aplicados, el flujo completo corrió de punta a punta contra datos reales: upload (202 inmediato) → `normalizar` → `procesar` → `cruzar` → `diff` (46.889 nuevos, 0 modificados/eliminados — coherente con partir de un `Cargo` vacío) → `guardando` → `pendiente` → **aprobar → 200 OK, `COMMIT`**. Conteos finales verificados en la BD real (no solo el 200 OK): **45.083 `personas`, 46.889 `cargos`, 46.889 `ocupaciones`, 46.889 `padron_historico`** — los dos primeros números coinciden exactamente con los ya documentados del sistema legacy (`personas_dotacion`: 45.083 personas; `cargo_dotacion`: 46.889 registros activos, ver `ARQUITECTURA_ONBOARDING.md` del proyecto `dotacion-rrhh`), una validación cruzada fuerte de que los datos reales quedaron bien cargados y no son ruido. Tiempo de aprobación con el fix: ~35s (haciendo el trabajo real de crear ~46.889 personas + ocupaciones + histórico), dentro del objetivo de "< 60s para 48k registros" de la sección 8.

Hallazgos adicionales, no bloqueantes pero relevantes:
- **`apps/api/Dockerfile` no existía** en el repo pese a que `docker-compose.yml` lo referencia — cualquier `docker compose up --build` fallaba antes de llegar a levantar nada. Creado (corre `tsx watch`, igual que `pnpm dev`), junto con un `.dockerignore` que faltaba (sin él, `node_modules` de Windows se mandaba entero al build context).
- La imagen `node:20-alpine` no traía `libssl` — el motor de schema de Prisma crasheaba al arrancar con un error no-JSON que rompía el parseo (`apk add openssl` agregado al Dockerfile).
- `prisma/migrations/` estaba **vacío** en el repo pese a que S0-2 ("primera migración") figura ✅. Corrección al diagnóstico original: la tabla `_prisma_migrations` de la BD real sí tenía un registro (`20260820151826_init`, aplicada 2026-08-20) — o sea que S0-2 sí corrió `migrate dev` en su momento, pero el archivo de esa migración nunca llegó a este checkout del repo (¿no comiteado, `.gitignore` de otra máquina, o se perdió en algún punto?). El historial versionado en git, que es lo que importa para reproducibilidad, estaba vacío igual. ✅ **Resuelto (2026-08-25)** — bauteo (baseline) sin tocar datos: `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (comando de solo lectura) generó `prisma/migrations/0_init/migration.sql` reflejando el schema actual completo; se agregó `prisma/migrations/migration_lock.toml` (provider `postgresql`); `prisma migrate resolve --applied 0_init` marcó esa migración como aplicada en la BD real (solo escribe en `_prisma_migrations`, no ejecuta el SQL — las tablas ya existían). Verificado con `prisma migrate status`: **"Database schema is up to date!"**, cero drift. Conteos de `personas`/`cargos`/`ocupaciones`/`historico` confirmados intactos antes y después.
- `pnpm db:seed` (script raíz) estaba roto: `tsx` no está en `node_modules/.bin` de la raíz (solo es dependencia de `apps/api`) — y además `prisma/seed.ts` importa `bcrypt`, que tampoco es dependencia de la raíz, así que agregar solo `tsx` no habría alcanzado. ✅ **Resuelto (2026-08-25)** — el script ahora delega a `apps/api` (que ya tiene `tsx`/`bcrypt`/`@prisma/client` resueltos vía pnpm workspace): `"db:seed": "pnpm --filter @srrhh/api exec tsx --env-file=.env ../../prisma/seed.ts"`. Corrido de verdad contra la BD real (`prisma/seed.ts` es idempotente, usa `upsert` en todo): `🌱 ... 🎉 Seed completado` sin errores, sin duplicar nada.

---

### SPRINT 3 — Personas y Cargos

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulos de personas y cargos completamente funcionales.

| #     | Tarea                                                           | Dev     | Est. | Prioridad  |     |
| ----- | --------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S3-1  | `GET /api/v1/personas` paginado con full-text search PostgreSQL | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S3-2  | `GET /api/v1/personas/:id` con ocupaciones activas              | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S3-3  | Filtros personas: hospital, escalafón, activo, búsqueda libre   | Jorge   | 4h   | 🟡 Medio   | ✅  |
| S3-4  | `GET /api/v1/cargos` paginado con filtros                       | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S3-5  | `GET /api/v1/cargos/:id` con ocupación actual                   | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S3-6  | PersonasPage: tabla con búsqueda debounce 300ms                 | Agustin | 8h   | 🔴 Crítico | ✅  |
| S3-7  | PersonaDetailPanel: panel lateral con datos + ocupaciones       | Agustin | 8h   | 🔴 Crítico | ✅  |
| S3-8  | CargosPage: tabla con filtros por hospital y escalafón          | Agustin | 8h   | 🔴 Crítico | ✅  |
| S3-9  | CargoDetailPanel: panel lateral con cargo + persona actual      | Agustin | 6h   | 🟡 Medio   | ✅  |
| S3-10 | Exportar a Excel desde PersonasPage y CargosPage                | Agustin | 4h   | 🟢 Bajo    | ✅  |
| S3-11 | Índice GIN tsvector en `personas.apellido_nombre` (migración)   | Jorge   | 3h   | 🟡 Medio   | ✅  |

**Criterio de éxito:**

- Búsqueda de personas por nombre/CUIL/DNI funciona con full-text search
- Filtros por hospital y escalafón funcionan
- Panel de detalle muestra ocupaciones activas
- Exportación a Excel disponible

**Backend listo, verificado contra datos reales (Jorge + Claude, 2026-08-25) — desbloquea a Agustin para S3-6 a S3-10:**

Las 5 tareas de Jorge (S3-1 a S3-5, S3-11) se implementaron y probaron contra la BD real cargada en Sprint 2 (45.083 personas, 46.889 cargos), no contra datos de prueba:

- `GET /api/v1/personas` — full-text search real de Postgres (`to_tsvector('spanish', apellido_nombre) @@ plainto_tsquery(...)`, apoyado en el índice GIN de S3-11) combinado con `ILIKE` sobre `cuil`/`numero_doc` para búsquedas exactas. Probado con `search=Gonzalez`: matchea apellidos compuestos como "Alarcon Gonzalez" (623 resultados), no solo coincidencia exacta al inicio del string. Filtros `hospitalId`/`escalafonId` cruzan por la ocupación vigente (`hasta IS NULL`) vía `EXISTS` — Prisma no soporta bien mezclar `$queryRaw` con relation-filters del query builder, así que todo el listado (búsqueda + filtros + paginación) es una sola query raw parametrizada (`Prisma.sql`, sin riesgo de inyección).
- `GET /api/v1/personas/:id` — Prisma `include` anidado (`ocupaciones.cargo.hospital`/`escalafon`), sin necesidad de raw SQL. Devuelve la forma `PersonaDetail` ya agregada a `packages/types`.
- `GET /api/v1/cargos` — filtros por `hospitalId`/`escalafonId`/`estado` directos (son FK/enum en `Cargo`) + `search` con `OR`/`contains` sobre `idSial`/`literalPuesto`/`especialidad`/`agrupador`. `hospital`/`escalafon` siempre expandidos (necesario para la tabla del frontend).
- `GET /api/v1/cargos/:id` — `ocupacionActual` (la fila con `hasta IS NULL`, o `null` si el cargo está vacante) con `persona` expandida. Forma `CargoDetail`, también agregada a `packages/types`.
- Tiempos de respuesta medidos contra los datos reales: 8-30ms en todos los casos probados (listado simple, búsqueda full-text, filtro por hospital, detalle con relaciones) — muy por debajo del objetivo de <500ms de la sección 8.
- `packages/types` ganó `PersonaDetail` y `CargoDetail` (antes no existían formas explícitas para las respuestas de detalle con relaciones expandidas) — Agustin puede tipar `PersonaDetailPanel`/`CargoDetailPanel` (S3-7/S3-9) contra estos tipos sin adivinar la forma de la respuesta.

`PersonaFilters`/`CargoFilters` en `packages/types` ya reflejan exactamente los query params que aceptan los endpoints reales, así que los hooks de TanStack Query se pueden tipar contra eso directamente.

**Frontend (S3-6 a S3-10) implementado y verificado visualmente con browser real (Jorge + Claude, 2026-08-25):**

Para no dejar bloqueado a Agustin más de lo necesario, se implementó también el frontend completo del sprint (originalmente asignado a Agustin) siguiendo exactamente los patrones ya establecidos en `modules/padron` (mismas clases Tailwind/Obelisco, mismo patrón de hooks TanStack Query, misma estructura de tabla + paginación):

- `PersonasPage` (S3-6) — tabla con búsqueda (debounce 300ms vía `useDebounce`, nuevo hook compartido) + filtros por hospital/escalafón/activo (S3-3), paginación.
- `PersonaDetailPanel` (S3-7) — datos personales completos (incluye los campos de contacto/domicilio de S2-17, que no estaban en el tipo `Persona` compartido — se agregaron a `PersonaDetail`, ver hallazgo abajo) + tabla de ocupaciones (vigente primero).
- `CargosPage` (S3-8) — tabla con filtros por hospital/escalafón/estado + búsqueda (agregada más allá del pedido mínimo del ticket, con el mismo debounce, ya que el backend de S3-4 ya la soportaba).
- `CargoDetailPanel` (S3-9) — datos del cargo + persona actual (o "vacante" si `ocupacionActual` es `null`), con link cruzado a `PersonaDetailPanel`.
- `exportToCsv` (S3-10) — sin agregar una librería nueva (no había `xlsx`/`sheetjs` en el proyecto y es una tarea 🟢 Bajo): CSV con BOM UTF-8, que Excel abre nativamente. Exporta la página actual, no "todo lo filtrado" (con 45k+ personas, eso necesitaría un endpoint sin paginar aparte, fuera de alcance de esta tarea) — el botón lo aclara.
- Endpoint nuevo no contemplado en el plan original: `GET /api/v1/escalafones` — no existía ningún endpoint de catálogo de escalafones (solo `hospitales`), y los selectores de filtro de S3-3/S3-8 lo necesitan.

**Hallazgos de la verificación (no bloqueantes, corregidos en el momento):**

| # | Hallazgo | Estado |
|---|---|---|
| 1 | `Persona` en `packages/types` no incluía los campos de contacto/domicilio de S2-17 (`telefono`, `mailPersonal`, `mailLaboral`, `domicilio`, `localidad`, `provincia`, `antiguedadDesde`) pese a que sí existen en el modelo Prisma y `getPersonaByIdService` los devuelve (no usa `select`). `tsc` lo agarró solo al escribir `PersonaDetailPanel`. | ✅ Agregados a `PersonaDetail` (no a `Persona` base, que sí refleja fielmente lo que devuelve el listado — ver comentario en el tipo). |
| 2 | Verificación visual con Playwright + Chrome real (headless) contra la BD real: primer intento pisó sin querer el puerto 5173 de **otra aplicación ajena** ("TorneoApp", ya visible en la sesión desde antes por logs pegados por error) — `vite --strictPort` sí falló como corresponde, pero el `curl` de verificación pegó contra la otra app y dio un falso positivo de "server up". Se relanzó en el puerto 5180. | 📋 Nada que corregir en el código — error de metodología de prueba, documentado para no repetirlo. |
| 3 | Con el puerto cambiado a 5180, `CORS_ORIGINS` de la API (hardcodeado a `5173` en `docker-compose.yml`) bloqueaba todo. | ✅ Agregado `5180` en `docker-compose.override.yml` (no commiteado, ya es el archivo para overrides de esta máquina). |
| 4 | `GET /api/v1/escalafones` (el endpoint nuevo del hallazgo de arriba) daba 404 en el browser real pese a andar bien por `curl` directo — el container `api` se había reiniciado para tomar el nuevo `CORS_ORIGINS` con `docker compose up -d api` **sin `--build`**, así que seguía corriendo la imagen vieja, de antes de agregar la ruta. El selector de escalafón se veía "andando" en la captura porque solo mostraba la opción por default ("Todos los escalafones") — nunca se había probado seleccionar una opción real. | ✅ Rebuild (`--build`) del container. Confirmado con logging de requests: cero errores HTTP en toda la corrida después del fix. |

Verificado con capturas de pantalla reales: login → `/personas` (lista, búsqueda "Gonzalez" con resultados reales, filtro por escalafón "Médicos" cambiando la lista) → detalle de persona (ocupaciones con hospital/escalafón/estado reales) → `/cargos` (lista, filtro por escalafón) → detalle de cargo → "Ver persona" navega de vuelta al mismo registro de persona (mismo CUIL, misma ocupación) — loop de navegación cruzada cargo↔persona confirmado consistente. Exportar CSV disparó una descarga real (`personas_pagina-1.csv`) verificada por el listener de `download` del browser, no solo "no tiró error".

⚠️ **Choque de trabajo en paralelo (2026-08-25):** Jorge y Agustin implementaron S3-6 a S3-10 de
forma independiente y simultánea, sin coordinarse — Agustin mergeó primero a `main` (vía `develop`),
Jorge lo descubrió recién al hacer `git pull` antes de mergear su propia rama, con conflictos
`add/add` en los 8 archivos nuevos del frontend. Jorge decidió mantener su propia versión (ya
verificada con browser real, ver arriba) y descartar la implementación de Agustin en el merge — las
notas de Agustin abajo describen su versión, **que ya no está en el código** (se preservan como
registro y porque su hallazgo de S3-7 es real y se incorporó a la versión que sí quedó). Dos cosas
rescatadas de su trabajo antes de descartarlo:
- El endpoint `GET /api/v1/escalafones` — ambos lo agregaron por separado, prácticamente idéntico;
  quedó la versión de Jorge (que ya estaba mergeada) sin cambios funcionales.
- El bug de timezone en fechas (`new Date(iso)` + `toLocaleDateString` corre un día para atrás en
  UTC-3) — la versión de Jorge nunca pasa las fechas por `new Date()` en el frontend (las mostraba
  como vienen de la API), así que no tenía ese bug específico, pero tampoco las formateaba — quedaban
  como ISO crudo. Se aprovechó el hallazgo para formatearlas bien de una, evitando el mismo patrón
  peligroso que encontró Agustin (`formatFecha()` en `PersonaDetailPanel.tsx`, arma la fecha a mano
  desde los componentes del string ISO, sin pasar por `Date`).

**S3-6 completado y verificado por Agustin (2026-08-25) — implementación descartada en el merge, ver nota de arriba:** `PersonasPage` — tabla, búsqueda con
debounce de 300ms (`useDebouncedValue`, hook nuevo en `shared/hooks/`), y de paso los 3 filtros
completos (hospital, escalafón, activo) en vez de solo búsqueda, ya que estaban en el contrato
(`PersonaFilters`) aunque no nombrados en el título de la tarea. Requirió agregar
`GET /api/v1/escalafones` (no existía — `hospitales.routes.ts` sí tenía su equivalente, este lo
espeja) para poder poblar el dropdown de escalafón sin pedir el UUID a mano; registrado en `app.ts`.
`useHospitales` se movió de `modules/usuarios/hooks/` a `shared/hooks/useCatalogos.ts` (ya no tiene
sentido que viva bajo usuarios si personas/cargos también lo necesitan) — re-exportado desde su
ubicación anterior para no romper el import existente en `AdminUsuariosPage`. Fila de la tabla
navega a `/personas/:id` (placeholder hasta S3-7). Verificado con Chrome headless vía CDP (red
mockeada): debounce real (tipear letra por letra dispara una sola request, no una por tecla),
filtros combinables entre sí y con la búsqueda, paginación preservando los filtros activos,
navegación al hacer clic en una fila, estados vacío y de error. Sin errores de consola en ningún
caso. `tsc --noEmit` limpio en `apps/web` y `apps/api`.

**S3-7 completado y verificado por Agustin (2026-08-25) — implementación descartada, ver nota de arriba:** `PersonaDetailPanel` — reemplaza el
placeholder en `/personas/:id`. Datos de la persona (CUIL, documento, sexo, fecha de nacimiento,
especialidad principal) + dos tablas de ocupaciones (vigentes y histórico, separadas por
`hasta === null`). Encontrado y corregido en la verificación: `formatFecha` armaba la fecha con
`new Date(iso)` (parsea como UTC medianoche) y la mostraba con `toLocaleDateString` (timezone
local) — en Argentina (UTC-3) eso corría cualquier fecha un día para atrás (`"2020-01-01"` se
mostraba `31/12/2019`). Se arma la fecha a mano desde los componentes de calendario del string, sin
pasar por UTC. Verificado con CDP: flujo feliz (fechas correctas, ocupaciones vigentes/histórico
separadas bien), error (persona no encontrada), y persona sin ocupaciones (oculta la sección de
histórico, muestra el estado vacío en vigentes). Sin errores de consola. `tsc --noEmit` limpio.

**S3-8 completado y verificado por Agustin (2026-08-25) — implementación descartada, ver nota de arriba:** `CargosPage` — mismo patrón que
`PersonasPage` (tabla, búsqueda debounce 300ms, filtros combinables), con `estado` (vigente/no
vigente/todos, default "vigentes") en vez de `activo`. Fila navega a `/cargos/:id` (placeholder
hasta S3-9). Verificado con CDP: filtro de estado preseleccionado en "vigentes", debounce real (una
sola request), navegación al hacer clic, estados vacío y de error. Sin errores de consola.
`tsc --noEmit` limpio.

**S3-9 completado y verificado por Agustin (2026-08-25) — implementación descartada, ver nota de arriba:** `CargoDetailPanel` — reemplaza el
placeholder en `/cargos/:id`. Datos del cargo (hospital, escalafón, régimen, especialidad,
agrupador, unificador de puesto) + sección de ocupación actual: si `ocupacionActual` es `null`
muestra "Cargo vacante"; si no, muestra la persona (con link directo a `/personas/:id`, cruzando
con S3-7), CUIL, situación de revista y estado. Verificado con CDP: cargo ocupado (incluyendo el
link a la persona), cargo vacante, y error (cargo no encontrado). Sin errores de consola.
`tsc --noEmit` limpio.

---

### SPRINT 4 — Concursos CPH

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo de seguimiento CPH completamente funcional.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- |
| S4-1  | `GET /api/v1/concursos-cph` paginado con filtros              | Jorge   | 5h   | 🔴 Crítico |
| S4-2  | `GET /api/v1/concursos-cph/:id` detalle completo              | Jorge   | 3h   | 🔴 Crítico |
| S4-3  | `PATCH /api/v1/concursos-cph/:id` actualizar campos por fase  | Jorge   | 6h   | 🔴 Crítico |
| S4-4  | Lógica `calcSubEstado`: 18 niveles calculados automáticamente | Jorge   | 8h   | 🔴 Crítico |
| S4-5  | `POST /api/v1/concursos-cph/:id/suspender`                    | Jorge   | 2h   | 🟡 Medio   |
| S4-6  | `POST /api/v1/concursos` crear concurso desde baja            | Jorge   | 4h   | 🔴 Crítico |
| S4-7  | ConcursosCphPage: tabla con sub-estado, filtros, alertas      | Agustin | 10h  | 🔴 Crítico |
| S4-8  | ConcursoCphDetail: formulario completo por fases              | Agustin | 12h  | 🔴 Crítico |
| S4-9  | Timeline visual del sub-estado (barra de progreso)            | Agustin | 6h   | 🟡 Medio   |
| S4-10 | Alertas: concursos sin movimiento > 30/60/90 días             | Agustin | 4h   | 🟡 Medio   |
| S4-11 | `GET /api/v1/kpis/concursos-cph` para tablero                 | Jorge   | 4h   | 🟡 Medio   |

**Criterio de éxito:**

- Sub-estado calculado automáticamente, no editable manualmente
- Alexis/CPH puede ver y actualizar todos sus concursos
- Alertas visibles para concursos estancados
- KPIs disponibles para el tablero

---

### SPRINT 5 — Concursos CEETPS + Bajas

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo CEETPS y flujo baja → concurso funcional.

| #    | Tarea                                                              | Dev     | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------ | ------- | ---- | ---------- |
| S5-1 | `GET/PATCH /api/v1/concursos-ceetps` con filtros                   | Jorge   | 6h   | 🔴 Crítico |
| S5-2 | ConcursosCeetpsPage: tabla con estado, escalafón, filtros          | Agustin | 10h  | 🔴 Crítico |
| S5-3 | ConcursoCeetpsDetail: formulario por fases ENF/TEC/EG              | Agustin | 10h  | 🔴 Crítico |
| S5-4 | Módulo Bajas: `POST /api/v1/concursos` con origen baja             | Jorge   | 6h   | 🔴 Crítico |
| S5-5 | Lógica: baja con `genera_concurso` → crea seguimiento automático   | Jorge   | 6h   | 🔴 Crítico |
| S5-6 | BajasPage: tabla + formulario nueva baja                           | Agustin | 8h   | 🔴 Crítico |
| S5-7 | Conexión baja → cargo: marcar cargo `no_vigente` al registrar baja | Jorge   | 4h   | 🔴 Crítico |
| S5-8 | `GET /api/v1/kpis/concursos-ceetps` para tablero                   | Jorge   | 3h   | 🟡 Medio   |
| S5-9 | Alertas CEETPS: concursos sin movimiento                           | Agustin | 3h   | 🟡 Medio   |

**Criterio de éxito:**

- Rijana puede gestionar concursos CEETPS desde la app
- Una baja genera automáticamente el seguimiento correspondiente
- El cargo se marca `no_vigente` al registrar la baja

---

### SPRINT 6 — Tablero KPIs + cierre MVP

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Dashboard operativo con KPIs reales y sistema listo para producción.

| #    | Tarea                                                                           | Dev             | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------------------- | --------------- | ---- | ---------- |
| S6-1 | `GET /api/v1/kpis/dotacion`: total vigentes, vacantes, por carrera, por efector | Jorge           | 6h   | 🔴 Crítico |
| S6-2 | KpisPage: cards con borde amarillo, skeleton loading                            | Agustin         | 6h   | 🔴 Crítico |
| S6-3 | KPIs concursales: por sub-estado, tiempo promedio por etapa                     | Jorge           | 6h   | 🔴 Crítico |
| S6-4 | Filtro por hospital en todo el tablero                                          | Agustin         | 4h   | 🟡 Medio   |
| S6-5 | Gráfico evolución dotación histórica (padron_historico)                         | Agustin         | 6h   | 🟡 Medio   |
| S6-6 | Alertas activas: concursos vencidos, bajas sin concurso                         | Jorge           | 4h   | 🟡 Medio   |
| S6-7 | Preparar docker-compose de producción                                           | Jorge           | 4h   | 🔴 Crítico |
| S6-8 | Smoke test completo del sistema                                                 | Jorge + Agustin | 4h   | 🔴 Crítico |

**Criterio de éxito:**

- Tablero carga en < 3 segundos
- KPIs reflejan datos reales del padrón aprobado
- Sistema listo para deploy en servidor propio

---

## 5. BACKLOG — Fuera de sprints actuales

| #   | Tarea                         | Motivo de postergación             |
| --- | ----------------------------- | ---------------------------------- |
| B-1 | Portal Postulante             | Sistema separado, fuera de alcance |
| B-2 | Integración API TAD           | No disponible en primera etapa     |
| B-3 | Firma digital real            | No disponible en primera etapa     |
| B-4 | Integración Hacienda          | No disponible en primera etapa     |
| B-5 | Redis cache para KPIs pesados | No necesario en arranque           |
| B-6 | Módulo de recorridas          | No urgente para MVP                |
| B-7 | Notificaciones por email      | Segunda fase                       |
| B-8 | App mobile nativa             | Segunda fase                       |
| B-9 | Multi-tab refresh token coordination (`BroadcastChannel`) | Trade-off aceptado con localStorage — no priorizado |
| B-10 | Migrar refresh token a cookie httpOnly + endpoint `/me` | Mejora de seguridad XSS — no priorizado para MVP |

---

## 6. FLUJO DE DEPLOY

```
Desarrollo local
  → git push origin feature/xxx
  → PR a develop
  → Review + merge

Staging (a definir):
  → Servidor propio (VPS)
  → docker-compose up -d
  → prisma migrate deploy

Producción:
  → Servidor propio
  → Infraestructura a definir en Sprint 6
```

---

## 7. REGISTRO DE DECISIONES

| Fecha   | Decisión                                        | Motivo                                                |
| ------- | ----------------------------------------------- | ----------------------------------------------------- |
| 2026-09 | Sin deadline fijo — calidad por etapa           | Prioridad en corrección, no en velocidad              |
| 2026-09 | Dotaneitor: analizar y optimizar, no reescribir | Ya funciona, Python es el lenguaje correcto para esto |
| 2026-09 | PostgreSQL sobre MySQL                          | Particionado, full-text search, window functions      |
| 2026-09 | shadcn/ui + Tailwind con tokens Obelisco        | Stack moderno + identidad institucional GCBA          |
| 2026-09 | Zustand para estado de auth                     | TanStack Query para servidor, Zustand para cliente    |
| 2026-09 | Docker desde el día 1                           | Entorno local = producción, deploy trivial            |
| 2026-09 | UUID como PK en todas las tablas                | Sin autoincremental, distribuible                     |
| 2026-09 | Soft delete en todas las tablas                 | Histórico inmutable, nunca DELETE en producción       |
| 2026-09 | Producción en servidor propio                   | A definir en Sprint 6                                 |
| 2026-08-21 | Dotaneitor escribe directo en tablas de catálogo (`Hospital`, `Escalafon`, `CodigoRegistro`, `Especialidad`, `Puesto`); `Persona`/`Cargo`/`Ocupacion` siguen detrás del flujo de aprobación de `padron_diff` | Evita saltear el control humano sobre datos de personas, sin duplicar catálogos de referencia (acordado Agustin/Jorge — ver `Doc/Dotaneitor_Analisis.md` sección 4.1) |
| 2026-09 | `Especialidad` y `Puesto` como catálogos de apoyo sin FK desde `Cargo` — `Cargo` mantiene campos de texto libre (`especialidad`, `literalPuesto`, `agrupador`, `unificadorPuesto`) | Cambiar a FK implicaba migración de datos y mayor alcance en Sprint 2; catálogos paralelos permiten normalización progresiva sin romper el modelo existente |

---

## 8. MÉTRICAS DE ÉXITO DEL MVP

| Métrica                                | Objetivo                          |
| -------------------------------------- | --------------------------------- |
| Tiempo de procesamiento padrón semanal | < 60 segundos para 48k registros  |
| Tiempo de carga del tablero            | < 3 segundos                      |
| Búsqueda de personas                   | < 500ms con full-text search      |
| Errores en producción post-deploy      | 0 críticos                        |
| Cobertura de flujo concursal CPH       | 100% de sub-estados implementados |
| Cobertura de flujo concursal CEETPS    | 100% de estados implementados     |
