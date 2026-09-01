# PLAN SCRUM — SRRHH v2

# Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

> Documento de planificación ágil. Fuente de verdad para sprints, tareas y decisiones de alcance.
> Última actualización: 2026-08-20 (Sprint 8 cerrado ✅ — validacion_vacante + validación de bajas)
>
> 📋 **Gestión de tareas:** [Notion — SRRHH v2](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)

---

## ESTADO ACTUAL

| Sprint                                               | Estado                                                          | Completado        |
| ---------------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| Sprint 0 — Infraestructura                           | ✅ Completado                                                   | S0-1 a S0-11      |
| Sprint 1 — Autenticación                             | ✅ Completado                                                   | S1-1 a S1-10      |
| Sprint 2 — Dotaneitor + Padrón                       | ✅ Completo — verificado end-to-end con datos reales 2026-08-25 | S2-1 a S2-19 (✅) |
| Sprint 3 — Personas y Cargos                         | ✅ Completo — verificado con browser real 2026-08-25            | S3-1 a S3-11 (✅) |
| Sprint 4 — Concursos CPH                             | ✅ Completo — verificado end-to-end con datos reales 2026-08-26 | S4-1 a S4-11 (✅) |
| Sprint 3 (post) — Mejoras UX padrón/personas         | ✅ Completado — commit f178819, 2026-08-27                      | ver detalle abajo |
| Sprint 3 (post-2) — Cargos: códigos, estados, UX     | ✅ Completado — 2026-09                                         | ver detalle abajo |
| Sprint 3 (post-3) — Mejoras UX personas/cargos       | ✅ Completado — 2026-08-28                                      | ver detalle abajo |
| Sprint 3 (post-4) — Maquetas Alta/Baja/Alta por Baja | ✅ Completado — 2026-09                                         | ver detalle abajo |
| Sprint 5 — Concursos CEETPS + Bajas                  | ✅ Completo — verificado end-to-end, mergeado a main 2026-09    | S5-1 a S5-10 (✅) |
| Sprint 6 — KPIs + Deploy                             | ✅ Completo — 2026-08-31, smoke test 21/21 OK                    | S6-0 a S6-8 (✅)  |
| Sprint 7 — Cargos: trazabilidad del alta manual      | ✅ Completo — RF-11 a RF-15 implementados, historial persistente, PDF, filtrado escalafones | S7-1 a S7-10 (✅) |
| Sprint 8 — Estado `validacion_vacante` + Validación de Bajas | ✅ Completo — S8A y S8B implementados, build limpio | S8A-1 a S8B-6 (✅) |
| Sprint 9 — Matriz de permisos + Landing/menú/guards  | 📋 Planificado                                                  | S9-1 a S9-11  |
| Sprint 10 — Notificaciones persistidas               | 📋 Planificado                                                  | S10-1 a S10-5 |
| Sprint 11 — Flujo concursal CPH con autorizaciones   | 📋 Planificado                                                  | S11-1 a S11-7 |

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
- [ ] Avisado por Notion/chat antes de tocar un módulo que otro dev pueda estar trabajando en paralelo

> **Nota:** el DoD original decía "PR aprobado" pero el equipo nunca usó PRs (2 devs, comunicación
> asíncrona). El choque de Sprint 3 (Jorge y Agustin implementando S3-6 a S3-10 en paralelo sin
> coordinarse, uno se descartó) pasó exactamente por eso. Se reemplaza por la regla que sí se puede
> cumplir: avisar antes de tocar un módulo compartido.

---

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

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Severidad | Estado                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **`audit_log` nunca escribía nada.** `app.ts` registraba `auditLog` como hook `preHandler` a nivel raíz, y Fastify corre los hooks de raíz _antes_ que los `preHandler` de cada plugin de rutas (donde vive `authenticate`, quien recién ahí popula `request.user`). Resultado: `request.user` siempre era `undefined` cuando `auditLog` corría, así que el `if (!user) return` cortaba en el 100% de las requests desde que se implementó — pese a estar marcada ✅. Verificado empíricamente con logs en el servidor real. | 🔴 Alta   | ✅ **Corregido** — `auditLog` pasó de `preHandler` a `onResponse` en `app.ts` (para ese punto del ciclo de vida todos los `preHandler`, incluidos los de plugins anidados, ya terminaron). Re-verificado: `request.user` llega poblado.                                                                                              |
| 2   | **Race condition teórica en la rotación de refresh token** (`auth.service.ts:refreshTokenService`). Lee el token, chequea `revocado`, y recién después lo marca revocado — son pasos separados, no atómicos. Si el mismo refresh token llega dos veces casi simultáneo (dos tabs, bug de cliente), ambas requests podrían pasar el chequeo antes de que ninguna confirme la revocación, rotando el mismo token dos veces y debilitando la garantía de "un solo uso".                                                         | 🟡 Media  | ✅ **Corregido** — `updateMany WHERE revocado = false` atómico: solo la primera request actualiza la fila; la segunda no encuentra nada que actualizar y cae en el bloque de revocación de familia.                                                                                                                                  |
| 3   | **Timing side-channel menor en el login** (`auth.service.ts:loginService`). Si el usuario no existe, la función devuelve rápido (sin `bcrypt.compare`); si existe pero la contraseña es incorrecta, corre bcrypt (~100ms). En teoría permite distinguir usuarios válidos por el tiempo de respuesta.                                                                                                                                                                                                                         | 🟢 Baja   | ✅ **Corregido** — siempre se corre `bcrypt.compare` contra un hash dummy cuando el usuario no existe, igualando el tiempo de respuesta.                                                                                                                                                                                             |
| 4   | **Multi-tab**: el `refreshToken` vive en `localStorage` (compartido entre pestañas del mismo origen), pero cada pestaña tiene su propio estado de módulo en memoria (`useAuth`/`api-client`, sin coordinación entre pestañas). Si dos pestañas refrescan casi al mismo tiempo, podría dispararse la detección de reutilización de tokens y cerrar sesión en ambas.                                                                                                                                                           | 🟢 Baja   | ⏳ **Limitación conocida**, trade-off ya aceptado junto con la decisión de usar `localStorage` en vez de cookie httpOnly (ver nota de S1-6/S1-7 más arriba en el historial de trabajo). Se resolvería con `BroadcastChannel` o eventos de `storage` para coordinar pestañas — no priorizado por ahora. Agregado al backlog como B-9. |

---

### SPRINT 2 — Dotaneitor optimizado + integración padrón

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Dotaneitor optimizado y conectado al flujo de padrón de SRRHH v2.

> **Ver `Doc/Dotaneitor_Analisis.md`** (secciones 6 y 7 para el mapeo de columnas y la deuda
> técnica de Sprint 0; sección 4.1 para los pasos 14-17 y sección 6.4 para la propuesta de campos
> nuevos en Persona/Cargo/Ocupacion, agregados el 2026-08-21 — nuevos requisitos de Agustin, ya
> acordados con Jorge en lo arquitectónico, que dan origen a S2-13 a S2-17 abajo).

| #     | Tarea                                                                                                                                                                                                                                                      | Dev     | Est. | Prioridad  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------- |
| S2-1  | Aplicar optimizaciones identificadas en Sprint 0 al Dotaneitor                                                                                                                                                                                             | Agustin | 12h  | 🔴 Crítico | ✅ 8/9 — queda solo #5 (staleness de `MAPEO_ESPECIALIDAD_POR_PUESTO`), informativo, sin acción pendiente |
| S2-2  | Endpoint `POST /api/v1/padron/upload`: recibe Excel, crea snapshot                                                                                                                                                                                         | Jorge   | 6h   | 🔴 Crítico | ✅                                                                                                       |
| S2-3  | Integración Node → Python: enviar archivo, recibir diff                                                                                                                                                                                                    | Jorge   | 8h   | 🔴 Crítico | ✅                                                                                                       |
| S2-4  | Guardar `padron_diff` en BD con resultado del Dotaneitor                                                                                                                                                                                                   | Jorge   | 4h   | 🔴 Crítico | ✅                                                                                                       |
| S2-5  | Endpoint `GET /api/v1/padron/snapshots/:id/diff` paginado                                                                                                                                                                                                  | Jorge   | 4h   | 🔴 Crítico | ✅                                                                                                       |
| S2-6  | Endpoint `POST /api/v1/padron/snapshots/:id/aprobar`                                                                                                                                                                                                       | Jorge   | 8h   | 🔴 Crítico | ✅                                                                                                       |
| S2-7  | Lógica de aprobación: actualizar ocupaciones, personas, cargos, historico                                                                                                                                                                                  | Jorge   | 10h  | 🔴 Crítico | ✅                                                                                                       |
| S2-8  | Endpoint `POST /api/v1/padron/snapshots/:id/rechazar`                                                                                                                                                                                                      | Jorge   | 2h   | 🔴 Crítico | ✅                                                                                                       |
| S2-9  | PadronPage: subir archivo + ver estado del job                                                                                                                                                                                                             | Agustin | 8h   | 🔴 Crítico | ✅                                                                                                       |
| S2-10 | PadronDiffPage: tabs Nuevos / Modificados / Eliminados                                                                                                                                                                                                     | Agustin | 10h  | 🔴 Crítico | ✅ (ruta directa por URL — entrada vía lista llega con S2-9)                                             |
| S2-11 | Badge en header cuando hay snapshot pendiente                                                                                                                                                                                                              | Agustin | 2h   | 🟡 Medio   | ✅                                                                                                       |
| S2-12 | Bloqueo: no se puede subir nuevo archivo con snapshot pendiente                                                                                                                                                                                            | Jorge   | 2h   | 🔴 Crítico | ✅                                                                                                       |
| S2-13 | Schema: 7 tablas `ref_*` nuevas — `ref_abreviaturas_tecnicas`, `ref_abreviaturas_titulo`, `ref_correcciones_lit_puesto`, `ref_correcciones_especialidad`, `ref_especialidad_por_puesto`, `ref_conectores_minuscula`, `ref_sufijos_ordinales`               | Jorge   | —    | 🔴 Crítico | ✅                                                                                                       |
| S2-14 | Schema: catálogos `Especialidad` y `Puesto` como tablas de apoyo (sin FK desde `Cargo` — texto libre se mantiene); Dotaneitor escribe directo en catálogos de bajo riesgo                                                                                  | Jorge   | —    | 🔴 Crítico | ✅                                                                                                       |
| S2-15 | Campo `Especialidad.prioritaria Boolean @default(false)`                                                                                                                                                                                                   | Jorge   | —    | 🟡 Medio   | ✅                                                                                                       |
| S2-16 | Campos `archivoResultadoPath` y `archivoCalidadPath` en `PadronSnapshot`                                                                                                                                                                                   | Jorge   | —    | 🟡 Medio   | ✅                                                                                                       |
| S2-17 | Schema: 7 campos nuevos en `Persona` (contacto/domicilio/antigüedad), 7 en `Cargo` (repartición/clasificaciones SIAL), 19 en `Ocupacion` (jefatura/comisión/bloqueo/documentación/`diasGuardia String[]`)                                                  | Jorge   | —    | 🟡 Medio   | ✅                                                                                                       |
| S2-18 | Upload async: `POST /upload` dispara pipeline en background y devuelve inmediato con `snapshotId`. `EstadoSnapshot` con `procesando`/`error`. Campo `pasoActual` para progreso granular. `GET /snapshots/:id/estado` para polling. Cleanup al arrancar.    | Jorge   | 4h   | 🔴 Crítico | ✅                                                                                                       |
| S2-19 | Dotaneitor migrado de MySQL a Postgres (SQLAlchemy). Decisión arquitectural: diff calculado por Node (Opción B). `/diff`, `/guardar-bd`, `/historial` eliminados. `calcularDiff()` en Node pagina `/preview` y compara contra Cargo+Ocupacion en Postgres. | Jorge   | 8h   | 🔴 Crítico | ✅                                                                                                       |

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

| #   | Hallazgo                                                                                                                                                                                                                              | Severidad | Estado                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`refreshTokenService`: ventana de inconsistencia** — `updateMany` atómico + `findUnique` separados: si el `findUnique` fallaba después del `updateMany`, el token quedaba revocado pero el usuario recibía 401 sin poder continuar. | 🟡 Media  | ✅ **Corregido** — ambas operaciones envueltas en `$transaction` atómica.                                                          |
| 2   | **`padronRoutes` sin `requireRole`** — cualquier usuario autenticado (incluso `viewer`/`director`) podía subir, aprobar o rechazar un padrón.                                                                                         | 🟡 Media  | ✅ **Corregido** — `requireRole([ADMIN, EDITOR])` agregado como `preHandler` en `POST /upload`, `POST /aprobar`, `POST /rechazar`. |
| 3   | **`throw { statusCode: 400 }` objeto literal** en `padron.routes.ts` — el `errorHandler` no lo reconocía y devolvía 500 en vez de 400.                                                                                                | 🟡 Media  | ✅ **Corregido** — reemplazado por `AppError.badRequest('Archivo requerido')`.                                                     |
| 4   | **`auditLog`: `entidadId` incorrecto para rutas anidadas** — `parts[4]` devolvía `'snapshots'` en vez del UUID para `/api/v1/padron/snapshots/:id/aprobar`.                                                                           | 🟢 Baja   | ✅ **Corregido** — regex UUID para encontrar el ID en cualquier posición de la URL.                                                |
| 5   | **N queries de catálogo en `aprobarSnapshotService`** — `findUnique` de hospital/escalafón por cada registro nuevo, sin caché.                                                                                                        | 🟢 Baja   | ✅ **Corregido** — `hospitalCache` y `escalafonCache` (`Map`) antes del loop.                                                      |
| 6   | **`idSialRol.split('-')[0]`** — frágil si el formato cambia o si `idSial` contiene guiones.                                                                                                                                           | 🟢 Baja   | ✅ **Corregido** — `cargoId` obtenido desde `tx.ocupacion.findUnique({ where: { idSialRol } })` (FK directa).                      |
| 7   | **`refreshExpiresAt` no soporta `'s'`** — regex `[dhm]` no incluía segundos, rompía tests de integración con expiración rápida.                                                                                                       | 🟢 Baja   | ✅ **Corregido** — regex extendida a `[dhms]`.                                                                                     |

**Hallazgos de revisión (Agustin, sobre S2-18/S2-19 de Jorge — 2026-08-24):**

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Severidad                                                                    | Estado                                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Severidad                                                                    | Estado                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ---                                                                          | ---                                                                                                                                                                                                                                                                                                                                                             |
| 1   | **`services/dotaneitor/main.py` tenía DOS `app = FastAPI(...)` de nivel de módulo** (línea 59 la nueva, línea 618 la vieja) — el commit de S2-19 agregó el código migrado a Postgres pero nunca borró el archivo original de antes de la migración, solo lo dejó pegado después. En Python, la segunda asignación de `app` pisa a la primera: **`uvicorn main:app` corría el objeto viejo**, con las 11 rutas viejas basadas en `mysql.connector` (que ni siquiera tiene variables de conexión configuradas en `docker-compose.yml`) — y `/diff`, `/guardar-bd`, `/historial`, `/ultima-actualizacion`, que se suponía habían sido eliminados, seguían activos. Todo el trabajo de S2-19 (`DotacionAutomationBD` con SQLAlchemy/Postgres, las rutas nuevas) quedaba registrado en un `app` huérfano, nunca sirviéndose. No se detecta revisando el diff línea por línea (la lógica nueva era correcta en sí misma) — solo corriendo el archivo real o buscando duplicados de nivel de módulo. | 🔴 **Alta** — invalidaba S2-19 en runtime pese a verse correcto en el código | ✅ **Corregido** — se borró la sección vieja completa (antes línea 557 en adelante, ~1000 líneas: `import mysql.connector`, el segundo `app = FastAPI`, `/diff`, `/guardar-bd`, `/historial`, `/ultima-actualizacion`, `COL_MAP`). El archivo quedó en 556 líneas, un solo `app`, 11 rutas, 0 referencias a `mysql`. Verificado con `ast.parse` + `py_compile`. |
| 2   | **`runPipeline()` sobreescribe `totalRegistros`** con el conteo del diff (`totalNuevos + totalEliminados + totalModificados`) al terminar con éxito, en vez de dejar el valor original (filas del Excel subido, fijado una sola vez al crear el snapshot). `PadronDiffPage.tsx` muestra ese campo como "X registros procesados" asumiendo que es el conteo del archivo — con el bug, muestra el conteo del diff en su lugar, un dato distinto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 🟢 Baja                                                                      | ✅ **Corregido** — se sacó la sobreescritura de `totalRegistros` de la transacción final de `runPipeline()` en `padron.service.ts`.                                                                                                                                                                                                                             |

Revisado también en detalle sin encontrar problemas: la construcción de `idSialRol` en `calcularDiff()` (usa `cuilYRol` completo en vez de solo el número de rol — distinto a lo documentado en `Dotaneitor_Analisis.md` §6.3, pero internamente consistente entre creación y lectura, no rompe nada), y el manejo de errores/estados de `runPipeline()` (marca `error` correctamente ante cualquier falla del pipeline).

⚠️ **Importante para Jorge:** el hallazgo #1 significa que hasta este fix, S2-19 nunca corrió de verdad en ningún entorno donde se haya levantado el servidor — vale la pena que lo confirme corriendo `docker-compose up` y probando el flujo completo una vez que traiga este cambio.

**Revisión completa de Sprint 2 — Agustin, 2026-08-24 (tareas propias y de Jorge):**

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Severidad                           | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`aprobarSnapshotService` sin timeout de transacción, con hasta 6 queries secuenciales por fila** (código de Jorge, S2-6/S2-7). `prisma.$transaction(...)` sin `{ timeout }` usa el default de Prisma — confirmado en `@prisma/client@5.22.0/runtime/library.d.ts`: `maxWait ?= 2000, timeout ?= 5000`. El loop original hacía entre 4 y 6 round-trips secuenciales a Postgres por cada `idSialRol` cambiado (hospital, escalafón, persona, cargo, ocupación + 2 más para histórico). Con eso, cualquier diff no trivial excede los 5s y hace rollback total (`P2028`). Grave en particular porque **la primera aprobación contra un Postgres recién migrado dispara esto siempre**: `calcularDiff()` compara contra `Cargo` (vacío al inicio) y marca _todo_ el padrón como "nuevo" — hasta ~48k filas (volumen ya establecido en Sprint 0). Rompía el criterio de éxito central del sprint en el primer uso real. El `errorHandler` tampoco reconoce `PrismaClientKnownRequestError`, así que el fallo llegaba al frontend como 500 genérico sugiriendo "reintentar", cuando reintentar da el mismo resultado siempre. | 🔴 **Crítica**                      | ✅ **Corregido** — reescrita para precargar en bloque (una query total, no una por fila) todo lo que antes se buscaba fila por fila, crear en bloque con `createMany` (troceado en lotes de 2000 para no pasarse del límite de parámetros de Postgres) en vez de un `create` por fila, batchear `eliminados` en un solo `updateMany` con `idSialRol: { in: [...] }`, y batchear el histórico con un `createMany` final en vez de un `create` por fila. "modificado" queda por fila (cada una cambia campos distintos, no se puede expresar como un único `updateMany`) pero sin el `find` extra que tenía antes. Se agregó además `{ timeout: 10min, maxWait: 10s }` como margen de seguridad. El mismo troceado se aplicó al `padronDiff.createMany` de `runPipeline()` (mismo riesgo de límite de parámetros con un diff de ~48k filas). Verificado con un harness en memoria (mock de `tx`, sin Postgres real disponible) cubriendo: dedup de hospital/escalafón/persona nuevos referenciados por múltiples filas del mismo lote, una persona con dos altas simultáneas, eliminado y modificado sobre datos preexistentes, e histórico con una fila por cada `idSialRol` tocado — 17/17 aserciones OK. |
| 2   | **S2-14 marcada ✅ pero la mitad del comportamiento descripto no existe.** La tarea dice "Dotaneitor escribe directo en catálogos de bajo riesgo" (tablas `Especialidad`/`Puesto`) — el schema está (S2-13/14), pero no hay ningún código, ni en `services/dotaneitor/*.py` ni en la API (`prisma.especialidad`/`prisma.puesto`), que escriba en esas tablas. Tampoco hay seed. Quedaron como catálogos fantasma: creados pero nunca poblados por nadie, y `Especialidad.prioritaria` (S2-15) queda inerte por la misma razón.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 🟡 Media                            | 📋 **Documentado, sin acción por ahora** — nada más depende todavía de que estas tablas tengan datos, se retoma cuando alguna tarea futura las necesite de verdad. Si Jorge tiene contexto de por qué quedó así (¿decisión consciente de postergarlo?), vale la pena que lo sume acá.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3   | **`prisma generate` nunca se había vuelto a correr después de la última reinstalación de `node_modules`** de esta sesión (mencionada en el historial de Sprint 1/2 al arreglar los symlinks rotos de `@turbo`/`@esbuild`) — pnpm resuelve `@prisma/client` a un stub sin generar (`PrismaClient: any`, literalmente el placeholder que trae el paquete antes de generar) en vez del cliente real. Efecto doble: (a) en runtime, la API **no podía arrancar** (`Error: @prisma/client did not initialize yet`) — verificado ejecutando el server real, no es teórico; (b) en compile-time, cualquier código que dependa de inferencia de tipos de Prisma en un contexto de destructuring (`Promise.all`) caía a `{}` en vez de tirar error real, así que `tsc --noEmit` venía dando falsos positivos de "limpio" en código que en verdad no tenía type-safety sobre Prisma. No es un bug de código de nadie — es un paso de setup que faltaba automatizar.                                                                                                                                                                 | 🔴 Alta (bloqueaba arrancar la API) | ✅ **Corregido** — se corrió `prisma generate` (quedó bien generado esta vez) y se agregó `"postinstall": "prisma generate --schema=./prisma/schema.prisma"` al `package.json` raíz para que no vuelva a pasar después de un `pnpm install` limpio. Con el cliente real generado, `tsc --noEmit` volvió a correr (ahora sí) contra los tipos reales y encontró 2 errores genuinos en el fix del hallazgo #1 (`.filter(Boolean)` no angosta `string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | undefined`a`string` en TS) — ya corregidos. El resto de la API (`auth.service.ts`, `usuarios.service.ts`, etc.) sigue limpio bajo los tipos reales. |

**Verificación end-to-end real (Jorge + Claude, 2026-08-25) — respondiendo a la advertencia del hallazgo #1 de Agustin de arriba ("vale la pena que lo confirme corriendo `docker-compose up` y probando el flujo completo"):**

Se corrió el stack completo en Docker (WSL, Docker Desktop) contra Postgres real y se subió un padrón real (`Cargos_salud_20260802.xlsx`, 47.203 filas) por la API, no un mock. Aparecieron **4 bugs adicionales que ningún review de código había detectado** porque solo se manifiestan corriendo el flujo real de punta a punta — mismo patrón que el hallazgo #1 de Agustin (uno de ellos, el #4, ni siquiera tira error: devuelve 200 OK y hace `COMMIT` sin haber hecho la mitad del trabajo):

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Severidad                                                                                                                                                                                                            | Estado                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`POST /upload` se colgaba indefinidamente** (`padron.routes.ts`) — el handler itera `request.parts()` con `for await` y para el part de tipo `file` solo guardaba la referencia (`file = part`) sin consumir el stream; `file.toBuffer()` se llamaba recién después, dentro de `uploadPadronService`, fuera del loop. Gotcha conocido de `@fastify/multipart`: si el stream de un `file` part no se drena mientras está activo en el iterador, `busboy` no puede avanzar al siguiente part — y como el archivo es la última parte del multipart, el `for await` nunca termina. La request quedaba colgada sin loggear error ni completar (confirmado: 10+ min sin respuesta, Dotaneitor sin recibir ni `POST /session` ni `POST /upload-cargos`, cero llamadas en sus logs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 🔴 **Crítica** — invalidaba S2-2/S2-3/S2-18 en runtime (el upload async nunca llegaba a dispararse)                                                                                                                  | ✅ **Corregido** — se resuelve `part.toBuffer()` inline dentro del loop, apenas se detecta el part de tipo `file`, y se pasa el buffer ya resuelto (no el `MultipartFile` crudo) a `uploadPadronService`. |
| 2   | **Pipeline de Dotaneitor crasheaba en el paso `procesar`** (`Dotaneitor.py:196`) al ajustar `AGRUPADOR` para `COD_SIT=32`. La columna se crea con `df['AGRUPADOR'] = df['CRUCE_AGRUPADOR'].map(agrupador_map)`; si para el archivo real ningún cruce matcheaba la tabla de referencia (o los matches daban NaN), pandas infería la columna entera como `float64`. La línea siguiente intenta escribir el string `'Enfermero/a ATP'` en esa columna — pandas moderno ya no hace el upcast implícito `float64→object` y tira `TypeError` (`LossySetitemError`), tumbando todo el job en Python. El reporte de calidad que ya existe para esto (`agrupador_no_encontrado`, `detalle_sin_agrupador`, sección 292/303 del archivo) nunca llegaba a generarse porque el crash pasaba antes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 🔴 **Crítica** — bloqueaba el paso `procesar` con cualquier padrón real                                                                                                                                              | ✅ **Corregido** — `.astype('object')` explícito sobre la columna recién mapeada, antes de la asignación condicional. No cambia ningún valor, solo garantiza que la columna pueda contener strings.       |
| 3   | **`aprobarSnapshotService` fallaba con `P2000` ("value too long for column type")** al crear un `Escalafon` nuevo — `tx.escalafon.create({ data: { codigo: nombre, nombre } })` reutiliza el nombre completo del escalafón como `codigo`, pero `Escalafon.codigo` es `VARCHAR(20)` en el schema (`Escalafon.nombre` es `VARCHAR(100)`). Cualquier nombre de escalafón real de más de 20 caracteres rompía el `create` y hacía rollback total de la transacción de aprobación (confirmado: 0 filas en `personas`/`cargos`/`ocupaciones`/`historico` tras el rollback, pese a que el diff se había calculado bien — 46.889 "nuevo"). `codigo` no se lee en ningún otro lugar del repo (confirmado por grep) — el lookup de esta misma función es por `nombre`, no por `codigo`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 🔴 **Crítica** — bloqueaba el `aprobar` en el primer uso real, exactamente el mismo patrón de "primera aprobación contra Postgres recién migrado" que el hallazgo #1 de arriba, pero en un punto distinto del código | ✅ **Corregido** — `codigo` ahora se genera como `nombre.slice(0, 12) + '-' + randomUUID().slice(0, 7)` (20 caracteres exactos, único, no depende de la longitud del nombre real).                        |
| 4   | **`aprobarSnapshotService` nunca creaba personas ni ocupaciones — falla silenciosa, sin excepción, `aprobar` devolvía 200 OK igual.** `calcularDiff()` guarda `cuil_y_rol` ("`<CUIL 11 dígitos>-<rol>`") en el JSON de cada diff "nuevo" — nunca un campo `cuil` suelto. `aprobarSnapshotService` leía `datos.cuil` (inexistente, siempre `undefined`) en 3 puntos: para armar `cuilsNecesarios` de la precarga, para el guard que decide si crear una `Persona` nueva, y para buscar la `persona` al armar cada `Ocupacion`. Con `datos.cuil` siempre `undefined`, `personasACrear` y `ocupacionesACrear` quedaban **siempre vacíos** — 0 personas, 0 ocupaciones, y por lo tanto 0 histórico (que se arma leyendo las ocupaciones recién creadas). `cargosACrear` sí funcionaba (usa `datos.id_sial`, un campo que sí existe), así que la transacción hacía `COMMIT` con 46.889 `cargos` creados y **0 en todo lo demás**, sin ningún error — el fix del hallazgo #3 de arriba (el `P2000` de Escalafon) fue lo que destapó esto: al dejar de romper, el `aprobar` "funcionaba" (200 OK) pero silenciosamente no hacía la mitad del trabajo. Se detectó recién comparando conteos reales en la BD contra lo esperado, no por ningún error en logs. | 🔴 **Crítica** — invalidaba el criterio de éxito central del sprint ("datos reales cargados") pese a un 200 OK limpio; el bug más peligroso de los 4 porque no se manifiesta como error                              | ✅ **Corregido** — nueva función `cuilDe(datos)` que deriva el CUIL puro desde `cuil_y_rol` (`.split('-')[0]`), usada en los 3 puntos que antes leían `datos.cuil`.                                       |

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

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Estado                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Persona` en `packages/types` no incluía los campos de contacto/domicilio de S2-17 (`telefono`, `mailPersonal`, `mailLaboral`, `domicilio`, `localidad`, `provincia`, `antiguedadDesde`) pese a que sí existen en el modelo Prisma y `getPersonaByIdService` los devuelve (no usa `select`). `tsc` lo agarró solo al escribir `PersonaDetailPanel`.                                                                                                                                                                            | ✅ Agregados a `PersonaDetail` (no a `Persona` base, que sí refleja fielmente lo que devuelve el listado — ver comentario en el tipo). |
| 2   | Verificación visual con Playwright + Chrome real (headless) contra la BD real: primer intento pisó sin querer el puerto 5173 de **otra aplicación ajena** ("TorneoApp", ya visible en la sesión desde antes por logs pegados por error) — `vite --strictPort` sí falló como corresponde, pero el `curl` de verificación pegó contra la otra app y dio un falso positivo de "server up". Se relanzó en el puerto 5180.                                                                                                          | 📋 Nada que corregir en el código — error de metodología de prueba, documentado para no repetirlo.                                     |
| 3   | Con el puerto cambiado a 5180, `CORS_ORIGINS` de la API (hardcodeado a `5173` en `docker-compose.yml`) bloqueaba todo.                                                                                                                                                                                                                                                                                                                                                                                                         | ✅ Agregado `5180` en `docker-compose.override.yml` (no commiteado, ya es el archivo para overrides de esta máquina).                  |
| 4   | `GET /api/v1/escalafones` (el endpoint nuevo del hallazgo de arriba) daba 404 en el browser real pese a andar bien por `curl` directo — el container `api` se había reiniciado para tomar el nuevo `CORS_ORIGINS` con `docker compose up -d api` **sin `--build`**, así que seguía corriendo la imagen vieja, de antes de agregar la ruta. El selector de escalafón se veía "andando" en la captura porque solo mostraba la opción por default ("Todos los escalafones") — nunca se había probado seleccionar una opción real. | ✅ Rebuild (`--build`) del container. Confirmado con logging de requests: cero errores HTTP en toda la corrida después del fix.        |

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

**S3-10 — actualizado por Agustin sobre la base de Jorge (2026-08-25):** el `exportToCsv` de Jorge
(página actual, CSV con BOM UTF-8) se reemplazó por `fetchAllPages()`/`downloadExcel()`
(`shared/lib/exportExcel.ts`, recuperado del stash de la implementación descartada en el choque de
arriba) en `PersonasPage` y `CargosPage`: exporta **todo el resultado filtrado** paginando en
bloques de 1000 contra el mismo endpoint de la tabla, y genera un `.xlsx` real con la librería
`xlsx` (SheetJS, dependencia nueva de `apps/web`) en vez de CSV. Se sacó `export-csv.ts` (dead code
tras el reemplazo). Verificado con CDP capturando la descarga real (`Page.setDownloadBehavior`) y
parseando el `.xlsx` resultante: en `PersonasPage`, 130 filas repartidas en 3 páginas de la API se
juntaron en un solo archivo de 130 filas; en `CargosPage`, mismo resultado. Sin errores de consola.
`tsc --noEmit` limpio.

**Hallazgo reportado por Jorge probando en `/personas` (2026-08-25):** el dropdown "Todos los
escalafones" traía 13 opciones, 3 de ellas (`Carrera Profesional Hospitalaria`, `Carrera de
Enfermería`, `Carrera de Técnicos de la Salud` — los 3 escalafones del seed, `prisma/seed.ts`,
pensados como categorías del flujo de concursos CPH/CEETPS, no como valores reales de la columna
`ESCALAFON` del padrón) con **0 cargos reales** cada una — nunca aparecen tal cual en los datos que
procesa el Dotaneitor (que usa `Médicos`, `Escalafón General`, `CEETPS`, etc., creados on-the-fly
por `aprobarSnapshotService` en Sprint 2). Verificado con una query directa a la BD (`cargos_count`
por escalafón): los 10 escalafones reales tienen entre 42 y 22.504 cargos cada uno; los 3 del seed, 0. | ✅ **Corregido** — `escalafones.routes.ts` ahora filtra `cargos: { some: {} } }` (relation
filter de Prisma: al menos un cargo real), dejando solo lo que la columna `ESCALAFON` del padrón
efectivamente produce. Verificado contra la API real: `GET /api/v1/escalafones` pasó de 13 a 10
resultados, exactamente los 10 con cargos.

**Hallazgo reportado por Jorge en `/personas` (2026-08-25): columnas "Documento" y "Especialidad"
siempre vacías.** Dos bugs distintos, no uno:

1. **`numeroDoc`/`tipoDoc` nunca se capturaban.** El Dotaneitor real sí trae `NUM_DOC`/`TIP_DOC`
   (renombrados a `NUMERO DOC`/`TIPO DOC` en `Dotaneitor.py`, `rename_dict`), pero `calcularDiff()`
   en `padron.service.ts` nunca los leía del resultado de Python, así que `aprobarSnapshotService`
   jamás tenía esos datos para escribir en `Persona`. No era falta de datos en origen, era un campo
   faltante en el mapeo. | ✅ **Corregido** — agregados `numero_doc`/`tipo_doc` al JSON de
   `calcularDiff()` y a la creación de `Persona` en `aprobarSnapshotService`.
2. **`especialidadPrincipal` apuntaba al campo equivocado.** La especialidad del padrón sí se
   capturaba, pero solo se escribía en `Cargo.especialidad` (la especialidad del puesto) —
   `Persona.especialidadPrincipal` (lo que muestra la columna de la tabla) nunca se tocaba. |
   ✅ **Corregido** — se usa el mismo valor como estimación inicial al crear la `Persona`. No se
   actualiza si la especialidad del cargo cambia después (la rama "modificado" no toca campos de
   `Persona`) — aceptable como mejor esfuerzo; en el padrón real la mayoría de las filas igual
   vienen sin especialidad salvo en carreras que la usan (CPH, principalmente).

Los dos fixes solo corrigen los **próximos** padrones — las 45.083 personas ya cargadas no se
actualizan solas (el código solo escribe estos campos al _crear_ una persona, no al encontrarla ya
existente). **Backfill directo desde el Excel real** (`Cargos_salud_20260802.xlsx`, el mismo de
Sprint 2), bypaseando todo el pipeline de Dotaneitor/diff/aprobar — solo `UPDATE ... FROM (VALUES
...)` por `cuil` contra la BD real, con `COALESCE` (no pisa nada que ya tuviera un valor, no toca
cargos/ocupaciones/histórico). De paso, mismo Excel también tiene `TELEFONO`, `MAIL_PERSONAL`,
`MAIL_LABORAL`, `DOMICILIO`, `LOCALIDAD`, `PROVINCIA` (campos de contacto de S2-17, con el mismo
problema — nunca se escribían), así que se backfillearon también sin costo extra. Resultado, sobre
45.083 personas: **45.083 con `numeroDoc`** (100% — el Excel real trae DNI para toda la dotación),
**13.423 con especialidad** (coincide con que solo ciertas carreras la usan), 40.433 con teléfono,
37.340 con domicilio.

**Falsa alarma en el camino:** verificando el resultado con `curl ... | python3 -m json.tool` en
esta terminal Windows, "Psiquiatría" se veía como "Psiquiatr**Ã­**a" — mismo patrón visual que el
mojibake real que ya rompió este documento una vez (ver hallazgos de Sprint 3 más arriba). Esta vez
**no era corrupción real**: se verificó el valor crudo almacenado en Postgres directo con `pg`
(bypaseando Prisma) y los codepoints eran correctos (`í` = `0xed`), y guardando la respuesta cruda
de la API a un archivo y leyéndolo con una herramienta que sí maneja UTF-8 bien, también se veía
"Psiquiatría" correcto. La causa: `python3 -m json.tool` leyendo de un pipe de stdin en este
Windows/Git Bash, mismo tipo de problema que `Get-Content` de PowerShell sin `-Encoding utf8` — no
es un problema del dato ni del backend, es un problema de la herramienta de verificación. Lección:
en esta máquina, para verificar UTF-8 no confiar en pipes por `python3`/PowerShell sin encoding
explícito — guardar a archivo y leer con una herramienta que sí lo maneje bien, o inspeccionar
codepoints a mano.

**Pedido de Jorge (2026-08-25): columna "Puesto" en la tabla de `/personas`, filtro por puesto, y
filtro de especialidad en cascada (solo si ese puesto tiene especialidades reales).** `literalPuesto`
es texto libre en `Cargo` (sin catálogo/FK — decisión de diseño de Sprint 2), así que no hay una
tabla de "puestos" para consultar directo.

- **Nuevo endpoint `GET /api/v1/puestos`** — agrupa `cargos` por `literal_puesto` y devuelve, para
  cada uno, el array de especialidades distintas que efectivamente aparecen ahí (`especialidades:
[]` para la mayoría de los puestos no médicos). 276 puestos distintos en los datos reales.
  Verificado: `Licenciado en Enfermería` y `Enfermero Profesional` → `[]`; `Médico de Planta` → ~140
  especialidades reales (Cardiología, Pediatría, etc.).
- **`listPersonasService` reescrito** — el filtro de hospital/escalafón pasó de un `EXISTS` a un
  `LEFT JOIN LATERAL` a la ocupación vigente + `cargos` (con `LIMIT 1` por las dudas de que alguna
  persona tenga más de una ocupación vigente a la vez, aunque no debería pasar por diseño) — hacía
  falta igual para poder devolver `literal_puesto` como columna de la tabla, así que se reusa el
  mismo join para filtrar por `puesto`/`especialidad` en vez de mantener dos caminos distintos al
  cargo vigente.
- **`packages/types`**: `PersonaListItem` (Persona + `puesto`, la forma real de
  `GET /api/v1/personas` — no se agregó a `Persona` porque `puesto` no es un campo de la persona en
  sí, es de su ocupación vigente) y `Puesto` (forma de `GET /api/v1/puestos`).
- **Frontend**: columna "Puesto" en la tabla; selector de puesto (276 opciones); selector de
  especialidad que solo aparece si hay un puesto elegido y ese puesto tiene especialidades reales —
  al cambiar de puesto se resetea la especialidad elegida (las opciones válidas cambian). Excel
  export actualizado con la columna Puesto.

Verificado contra la API real (no solo `tsc` limpio): `GET /api/v1/personas?puesto=Médico de
Planta&especialidad=Cardiología` devuelve 255 resultados, los 255 con ese puesto y esa especialidad
exactos — filtro combinado funcionando de punta a punta.

**Pedido de Jorge, seguido (2026-08-25): el dropdown de puesto (276 opciones) necesitaba búsqueda,
un `<select>` nativo obliga a scrollear a mano.** Nuevo `SearchableSelect`
(`shared/components/ui/`) — combobox genérico: input + lista filtrada en vivo al escribir,
clickear una opción confirma el valor, clickear afuera descarta lo tipeado sin confirmar y vuelve
al valor real (no deja el filtro "a medio escribir"). Reemplaza el `<select>` de puesto en
`PersonasPage`; el de especialidad (en cascada, pocas opciones por puesto) se dejó como `<select>`
nativo, no hacía falta. Verificado con browser real: abrir el combobox lista los 276 puestos,
escribir filtra en vivo, click confirma y dispara el filtro (probado con "Enfermero Profesional" —
sin especialidad, no aparece el filtro en cascada — y "Médico de Planta" — sí aparece, con
especialidades reales correctas por fila).

**Pedido de Jorge, seguido (2026-08-25): "medico" no encontraba "Médico" — o se sacan los acentos
de la base, o la búsqueda los ignora.** Se eligió lo segundo: los datos reales (nombres de puesto,
especialidades, apellidos) siguen guardados tal cual vienen del padrón — "Médico de Planta",
"Psiquiatría" — sacarles el acento para "facilitar la búsqueda" degradaría la calidad real del dato
(nombres de cargos oficiales del GCBA) para resolver un problema que es de comparación, no de
almacenamiento.

- **Migración `unaccent_search`** — instala la extensión `unaccent` (contrib estándar de Postgres,
  no hace falta nada externo) y crea una config de text search `spanish_unaccent` (copia `spanish`
  pero encadena `unaccent` antes del stemmer). El índice GIN de `personas.apellido_nombre` (S3-11)
  se recreó con esta config — Postgres solo usa el índice si la expresión de la query matchea
  exactamente la del índice, así que no alcanzaba con cambiar solo la query.
  `CREATE TEXT SEARCH CONFIGURATION` no soporta `IF NOT EXISTS` (a diferencia de
  `EXTENSION`/`INDEX`/`TABLE`) — la migración falló en el primer intento por eso, se resolvió con
  `prisma migrate resolve --rolled-back` (Postgres había revertido todo solo, era una transacción
  atómica, se verificó que no quedó nada a medias) y se reescribió con un `DO` block.
- **`listPersonasService`** — `to_tsvector('spanish', ...)` → `to_tsvector('spanish_unaccent', ...)`.
- **`listCargosService`** — el `search` (idSial/literalPuesto/especialidad/agrupador) usaba
  `contains`/`mode: insensitive` del query builder de Prisma, que es case-insensitive pero no saca
  acentos, y Prisma no deja llamar `unaccent()` dentro de un `where` tipado. Se resuelve en dos
  pasos: una query raw con `unaccent(...) ILIKE unaccent(...)` trae los `id` que matchean, esos IDs
  alimentan el `where.id.in` de la query tipada de siempre (que sigue trayendo
  `hospital`/`escalafon` con `include`, sin reescribir eso a mano en SQL).
- **`SearchableSelect`** (combobox de puesto, lado cliente) — el filtro en JS usaba
  `.toLowerCase()`, que tampoco saca acentos. Se agregó `normalize()`: `.normalize('NFD')` separa
  cada letra acentuada en base + diacrítico, `\p{Diacritic}` (Unicode property escape nativo de JS,
  sin librería) saca esos diacríticos sueltos.

Verificado con datos reales, los tres frentes: `GET /personas?search=gonzalez` (sin acento) →
623 resultados, exactamente los mismos que buscando "Gonzalez" con acento; `GET
/cargos?search=medico` → 13.516 resultados, primeras filas con `literalPuesto: "Médico de Planta"`;
combobox de puesto con browser real, escribir "medico" filtra correctamente a "Médico de Planta",
"Médico Veterinario de Guardia/Planta", "Especialista en la Guardia Médico", "Profesional Guardia
Médico".

**Pedido de Jorge (2026-08-26): "Quayat, Mariana Celina" en `/personas/:id` tenía Sexo, Fecha de
nacimiento y Antigüedad vacíos.** Mismo patrón de bug que Documento/Especialidad (hallazgo del
2026-08-25, más arriba): el Dotaneitor real trae `SEXO`, `FEC_NACIM` (sin renombrar/renombrado a
"FECHA NACIMIENTO") y `SALUD_1ER_CARGO` (renombrado a "ANTIGÜEDAD") con cobertura casi total
(45.076/45.083 con sexo, 45.083/45.083 con fecha), pero `calcularDiff()` nunca los capturaba. ✅
**Corregido** — agregados al JSON de `calcularDiff()` y a la creación de `Persona` en
`aprobarSnapshotService` (nuevo helper `parseFechaDDMMYYYY()` — el Excel trae fechas como
`"DD/MM/YYYY"`, `new Date("DD/MM/YYYY")` las interpreta mal en Node, formato ambiguo que asume
MM/DD). **Backfill** de las 45.083 personas ya cargadas, mismo patrón que Documento/Especialidad
(leer el Excel real, `UPDATE ... COALESCE` por CUIL, sin tocar cargos/ocupaciones/histórico).
Verificado: Mail personal/laboral de Quayat siguen vacíos después del backfill — se confirmó contra
la fila cruda del Excel que genuinamente no tiene esos datos (no es un bug, es ausencia real de
dato en el origen).

**Mismo pedido, extendido a Cargo: `CargoDetailPanel` tampoco traía todo.** Revisando el cargo que
motivó el pedido (`000110898-1`, Bianco/Médico de Planta) contra su fila cruda del Excel:
Especialidad/Agrupador/Unificador de puesto ya se capturan bien en el código existente y están
genuinamente vacíos en el origen para ese cargo puntual (no es un bug) — pero **Régimen nunca se
capturaba** pese a tener 100% de cobertura en el Dotaneitor real (`Salud`/`General`/`Docente`,
47.203/47.203 filas). ✅ **Corregido** igual que los demás — agregado a `calcularDiff()` y
`aprobarSnapshotService`, backfill de los 46.889 cargos por `id_sial` (no por CUIL, es un campo del
cargo).

**Pedido de Jorge, mismo hilo: "código cargo" con la nomenclatura ya estipulada, para todos los
cargos.** Investigado contra el sistema legacy que se está reemplazando
(`C:\Desarrollo\SRH\dotacion-rrhh`, `Doc/REGLAS_NEGOCIO.MD` §3 + `AltaCargoService.js`): es un
código interno (`{CARRERA}[-{TIPO}][-{MODALIDAD}]-{seq 6 dígitos}`, ej. `CPH-POU-000056`) que **se
generaba solo al dar de alta un cargo a mano** — no viene del padrón, y **esta función de "Alta de
Cargo" no existe todavía en este proyecto nuevo** (no está en ningún sprint S0-S6 del plan). Gap
real, anotado acá para retomar — ver sección de backlog.

Para los 46.889 cargos ya cargados (pedido explícito de Jorge: generarlo igual, retroactivo), la
clasificación por carrera+tipo+modalidad necesitó reconstruirse desde cero — el `Cargo` de este
proyecto solo tiene `escalafon` (texto libre), no las categorías estructuradas
(`carreras`/`tipos_cargo`/`modalidades`) que tiene el legacy. Decisiones tomadas junto con Jorge
antes de generar nada (evitando adivinar en un sistema de RRHH de gobierno):

| Escalafón real                                              | Cargos | Carrera asignada | Cómo se decidió                                                                                                                                        |
| ----------------------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Médicos                                                     | 22.504 | CPH              | Mapeo directo, sin ambigüedad                                                                                                                          |
| Escalafón General                                           | 6.359  | EG               | Mapeo directo                                                                                                                                          |
| CEETPS → Enfermería (Lic./Enfermero Prof./Auxiliar)         | 11.040 | ENF              | Clasificado por puesto real, no por escalafón (CEETPS mezcla ENF/TEC/EG)                                                                               |
| CEETPS → resto ("Técnico en X" / "Licenciado en [técnico]") | 3.562  | TEC              | Ídem — POU solo para los 4 puestos que `REGLAS_NEGOCIO.MD` marca explícitamente (Radiología, Hemoterapia, Instrumentación Quirúrgica x2), el resto POF |
| CEETPS → Bioterio                                           | 4      | EG               | Único puesto de CEETPS que no encajaba en ENF/TEC                                                                                                      |
| Residentes                                                  | 2.665  | RES              | Jorge decidió generarles código igual, aunque el legacy los excluye del alta — formato propio `RES-{seq}` (el legacy no define ninguno)                |
| Docentes                                                    | 356    | DOC              | Ídem, `DOC-{seq}`                                                                                                                                      |
| Carrera Gerencial                                           | 180    | RG               | Mapeo directo                                                                                                                                          |
| Planta Transitoria                                          | 69     | EG               | Confirmado por Jorge                                                                                                                                   |
| Cuerpos Transitorios                                        | 63     | EG               | Confirmado por Jorge                                                                                                                                   |
| Planta de Gabinete                                          | 45     | EG               | Confirmado por Jorge                                                                                                                                   |
| Autoridades Superiores                                      | 42     | AS               | Mapeo directo                                                                                                                                          |

Tipo (jefe/director/subdirector para CPH; jefe_eg/director_eg/gerencial para EG; ministro/
subsecretaria/dir_general/dir_general_adjunta para AS) y modalidad (POU si el puesto real dice
"Guardia", POF si dice "Planta" o no dice nada) se determinaron mirando los puestos reales de cada
carrera contra la BD (no adivinando) — ningún puesto de los escalafones mapeados a EG tiene
Jefe/Director/Gerencial en los datos reales, así que EG quedó sin sub-tipos, todo `EG-{seq}`.

Implementación: `prisma/schema.prisma` gana `Cargo.codigo String? @unique @db.VarChar(30)`
(migración `cargo_codigo`, columna nullable — no todo cargo futuro lo va a tener automáticamente,
solo los que pasen por una futura función de Alta). Script de generación (`generate_codigos.mjs`,
no versionado — es un backfill de una sola vez, no código de aplicación) clasifica cada cargo,
agrupa por prefijo, y asigna secuencial empezando en 1 por grupo (orden determinístico por
`id_sial`). Verificado antes de escribir nada: la suma de los 16 grupos resultantes da exactamente
46.889, 0 cargos sin clasificar. `CargosPage`/`CargoDetailPanel` (frontend) y `packages/types`
actualizados con el campo nuevo. Verificado contra la API real: cargo `000110898-1`
(Bianco/Médico de Planta, sin "Guardia" en el puesto) → `codigo: "CPH-POF-000001"`.

**Pedido de Jorge (2026-08-26): dos ajustes al dropdown de escalafón de `/personas`.**

1. Mostrar **"CPH"** en vez de **"Médicos"** en el dropdown — cambio puramente cosmético/visual, el
   dato real (`Escalafon.nombre = "Médicos"`) no cambia ni en la base ni en el filtro que se envía a
   la API (sigue siendo el `id` real del escalafón). `escalafonLabel()` en `PersonasPage.tsx`.
2. **Orden alfabético por el label mostrado**, no por `Escalafon.nombre` crudo — con el cambio
   anterior, "CPH" quedaba huérfano bajo la M de "Médicos" en vez de ordenar bajo la C. Se ordena una
   copia de `escalafones` con `escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')`
   antes de mapear las `<option>`.

**Mismo pedido, tercer cambio: el dropdown de Puesto ahora filtra en cascada por el Escalafón
elegido** (antes mostraba los 276 puestos siempre, sin importar el escalafón activo).
`GET /api/v1/puestos` acepta ahora un query param opcional `escalafonId` (zod, mismo patrón que
`personas.schema.ts`/`cargos.schema.ts`) y agrega `AND escalafon_id = $1` al `WHERE` cuando viene
presente. `usePuestos(escalafonId)` en el frontend lo pasa como param (y lo suma al `queryKey` para
que React Query cachee por escalafón), y `cambiarEscalafon()` en `PersonasPage` resetea
puesto/especialidad al cambiar de escalafón (mismo patrón ya existente en `cambiarPuesto()` con
especialidad — las opciones válidas cambian, así que la selección previa puede dejar de existir).

Verificado contra la API real (`GET /api/v1/puestos` con token real): sin filtro, 276 puestos; con
`escalafonId` de Médicos, 62; con `escalafonId` de Docentes, 8 (Director INST. SUP. de Tecnicat.
P/la Salud, Instructor Técnico Escuela Técnicos para la Salud, Maestro Celador Hospital Manuel
Rocca, etc. — coincide exactamente con lo que trae `/personas?escalafonId=...` para ese escalafón).
Verificado con browser real: dropdown de escalafón ordenado "Autoridades Superiores, Carrera
Gerencial, CEETPS, **CPH**, Cuerpos Transitorios, Docentes, Escalafón General, Planta de Gabinete,
Planta Transitoria, Residentes"; al elegir "Docentes", el combobox de puesto muestra exactamente los
8 puestos esperados (screenshot verificado, tabla de personas también se filtra en consistencia).

**Pedido de Jorge (2026-08-26): en `/cargos`, reemplazar la columna "ID SIAL" de la tabla por el
"Código Cargo"** (el generado con la nomenclatura heredada, ver más arriba) — `id_sial` deja de
mostrarse en la tabla/Excel, pasa a mostrarse `codigo`. Extendido también, para mantener la búsqueda
consistente con lo que ahora se ve en pantalla: `GET /api/v1/cargos?search=` ahora matchea también
contra `unaccent(codigo)` además de `id_sial`/`literal_puesto`/`especialidad`/`agrupador` (antes solo
se podía buscar por ID SIAL, que ya no es visible). `id_sial` no se toca en ningún otro lado — sigue
siendo un identificador real, puede aparecer en planillas/expedientes externos.

**Mismo pedido, extendido: en `/cargos`, el dropdown de escalafón también muestra "CPH" en vez de
"Médicos" y ordena alfabéticamente por ese label** — mismo cambio ya hecho en `/personas` (ver
arriba), esta vez replicado ahí. Se aprovechó para sacar `escalafonLabel()` de `PersonasPage.tsx` a
un util compartido (`shared/lib/escalafonLabel.ts`) en vez de duplicar la función en las dos páginas.

Verificado con browser real (2026-08-26): tabla de `/cargos` muestra columna "Código Cargo" con
valores reales (`CPH-POF-000001`, `EG-000001`, `CPH-POU-000001`, etc.); dropdown de escalafón con el
mismo orden verificado en `/personas` y "CPH" en la posición correcta.

**Cierre del pendiente de verificación (Jorge + Claude, 2026-08-26):** confirmado que el contenedor
`api` seguía corriendo la imagen vieja (`docker exec srrhh_api cat .../cargos.service.ts` no traía la
rama `unaccent(codigo)`, pese a que `docker images` mostraba un build reciente — ese build había sido
por un cambio anterior, no por este). `docker compose up -d --build api` reconstruyó con el código
real. Reverificado contra la API real: `GET /api/v1/cargos?search=CPH` pasó de 0 a **22.504
resultados**, los primeros con `codigo: "CPH-POF-000001"`, `"CPH-POU-000001"`, etc. — coincide
exactamente con el total de cargos CPH ya conocido de Sprint 3. Sprint 3 ahora sí cerrado sin
pendientes.

---

### SPRINT 4 — Concursos CPH

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo de seguimiento CPH completamente funcional.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S4-1  | `GET /api/v1/concursos-cph` paginado con filtros              | Jorge   | 5h   | 🔴 Crítico | ✅  |
| S4-2  | `GET /api/v1/concursos-cph/:id` detalle completo              | Jorge   | 3h   | 🔴 Crítico | ✅  |
| S4-3  | `PATCH /api/v1/concursos-cph/:id` actualizar campos por fase  | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S4-4  | Lógica `calcSubEstado`: 18 niveles calculados automáticamente | Jorge   | 8h   | 🔴 Crítico | ✅  |
| S4-5  | `POST /api/v1/concursos-cph/:id/suspender`                    | Jorge   | 2h   | 🟡 Medio   | ✅  |
| S4-6  | `POST /api/v1/concursos` crear concurso desde baja            | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S4-7  | ConcursosCphPage: tabla con sub-estado, filtros, alertas      | Agustin | 10h  | 🔴 Crítico | ✅  |
| S4-8  | ConcursoCphDetail: formulario completo por fases              | Agustin | 12h  | 🔴 Crítico | ✅  |
| S4-9  | Timeline visual del sub-estado (barra de progreso)            | Agustin | 6h   | 🟡 Medio   | ✅  |
| S4-10 | Alertas: concursos sin movimiento > 30/60/90 días             | Agustin | 4h   | 🟡 Medio   | ✅  |
| S4-11 | `GET /api/v1/kpis/concursos-cph` para tablero                 | Jorge   | 4h   | 🟡 Medio   | ✅  |

**Hallazgos de revisión (Sprint 4 backend, Jorge — corregidos en paralelo, mientras Agustin ya
avanzaba con S4-7 a S4-10 sobre la versión anterior del backend):**

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                     | Severidad | Estado                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`suspenderConcursoCphService` podía "des-finalizar" un concurso cerrado** — solo chequeaba `suspendido === body.suspendido` (idempotencia), pero no el `estado` actual. Un concurso `finalizado` o `desierto` podía recibir `POST /suspender` y quedar con `estado: suspendido`, pisando el estado terminal.                               | 🔴 Alta   | ✅ **Corregido** — guard explícito: 409 si `estado` es `finalizado` o `desierto` antes de cualquier otra validación.                                                                                                                                                              |
| 2   | **Bypass de rol en `POST /concursos`** — `concursales_ceetps` podía crear un concurso `tipoConcurso: cph` (y viceversa). El `requireRole` solo chequeaba que el usuario tuviera alguno de los 4 roles de escritura, sin cruzar con el tipo de concurso del body. Después de crearlo, el usuario no podía ni editarlo — estado inconsistente. | 🔴 Alta   | ✅ **Corregido** — validación en el handler: `concursales_ceetps` recibe 403 si intenta crear CPH, y viceversa. `admin`/`editor` pueden crear cualquiera.                                                                                                                         |
| 3   | **Race condition en el guard de duplicados CPH** — `createConcursoService` hacía `findFirst` (¿existe concurso abierto?) y luego `create` en pasos separados. Dos requests concurrentes podían pasar el `findFirst` antes de que ninguna hiciera el `create`, creando dos concursos CPH abiertos para el mismo cargo.                        | 🟡 Media  | ✅ **Corregido** — partial unique index a nivel de BD (`CREATE UNIQUE INDEX ... WHERE estado NOT IN ('finalizado', 'desierto')`), migración `concurso_cph_unique_abierto` aplicada. El guard en el service queda como primera línea de defensa; el índice es el backstop atómico. |

> Estos 3 hallazgos son sobre `suspenderConcursoCphService`/`POST /concursos` (S4-3/S4-5/S4-6) — no
> tocan `listConcursosCphService`/`getConcursoCphByIdService` (S4-1/S4-2) ni `calcConcursoCph`
> (S4-4), que es de donde depende el frontend de S4-7 a S4-10. No hace falta re-verificar esas 4
> tareas contra este fix; si se toca `suspenderConcursoCphService` o `POST /concursos` de nuevo, ahí
> sí vale la pena volver a probar el botón "Suspender/Reanudar" de `ConcursoCphDetail`.

**Criterio de éxito:**

- Sub-estado calculado automáticamente, no editable manualmente
- Alexis/CPH puede ver y actualizar todos sus concursos
- Alertas visibles para concursos estancados
- KPIs disponibles para el tablero

**Backend completo y verificado contra la BD real (Jorge + Claude, 2026-08-26) — desbloquea a
Agustin para S4-7 a S4-10:**

Antes de codear, se resolvió una decisión de diseño pendiente con Jorge: la fórmula `calcSubEstado`
de referencia (sistema legacy, `dotacion-rrhh/app/src/modules/seguimiento-cph/seguimientoCphCalc.js`,
ya en producción) usa varios campos que `ConcursoCph` no tenía todavía (`fechaBaja`,
`fechaEeConcurso`, `proyectoResolucion`, `resoALaFirma`, `fechaResolucion`, `cargaDocumentacion`,
`cargoSial`, `dispoDesierta`, `fechaDispoDesierta`). Se optó por extender el schema (migración
`concurso_cph_calc_fields`, aplicada contra la BD real sin shadow database: `prisma migrate diff
--from-schema-datasource` para generar el SQL sin interactividad, mismo patrón non-interactivo que
el baseline de Sprint 2) en vez de recortar la fórmula — mantiene paridad completa con el sistema que
se reemplaza. Se agregó también `subEstado3` (el sub-estado de 8 niveles usado para KPIs/alertas) y un
índice sobre `subEstado`. Campos denormalizados del legacy que ya viven en relaciones del schema
nuevo (persona/cargo/hospital vía FKs) **no** se portaron — solo los que la fórmula necesita.

- **`concursosCph.calc.ts`** — puerto a TypeScript de `calcEstado`/`calcSubEstado`/`calcSubEstado3`,
  mismos 19 niveles y mismos nombres de nivel que el legacy (`Q-DESIERTO` ... `NO INICIADO`) para no
  perder trazabilidad. A diferencia del legacy (que dejaba al frontend calcular y mandar
  `estado`/`sub_estado` a mano en el PUT — confirmado leyendo `SeguimientoCphEntity`/`Controller`
  legacy, el backend nunca los recalculaba), acá el backend es la única fuente de verdad: el schema
  Zod del PATCH (`.strict()`) ni siquiera acepta `estado`/`subEstado`/`subEstado3` en el body — se
  recalculan siempre server-side en cada create/PATCH/suspender y se persisten (no se recalculan al
  leer) para poder filtrar/indexar sin recorrer toda la tabla. Excepción: `subEstado3` tiene dos ramas
  que comparan contra la fecha de hoy y se desactualizan solas con el paso del tiempo — el filtro de
  listado (S4-1) y el agregado de KPIs (S4-11) lo recalculan en vivo con `SUB_ESTADO_3_SQL_PG` (CASE
  SQL, réplica en Postgres del `SUB_ESTADO_3_SQL` de MySQL del legacy) en vez de confiar en el valor
  guardado, mismo mecanismo que ahí.
- **`GET /api/v1/concursos-cph`** (S4-1) — filtros por `hospitalId`/`estado`/`subEstado`/`subEstado3`/
  `suspendido`/`search` (libre sobre EE de baja/concurso, especialidad solicitada, resolución,
  observaciones). `subEstado3` resuelve ids vía `$queryRaw` antes del `where` tipado, mismo patrón que
  `cargos.service.ts` (S3). Trae `concurso` (con `cargo`/`persona`), `hospital` y `personaDesignada`
  expandidos.
- **`PATCH /api/v1/concursos-cph/:id`** (S4-3) — un solo endpoint para las 6 "fases" de la tabla
  (baja/apertura, autorización, inscripción/examen, IFACS/INSAL, designación, desierto) en vez de uno
  por fase — todos los campos son opcionales (`.partial()`), el cliente manda solo lo que cambió en
  esa pantalla. Recalcula y persiste `estado`/`subEstado`/`subEstado3` en cada llamada.
- **`POST /api/v1/concursos-cph/:id/suspender`** (S4-5) — mismo endpoint reanuda si se manda
  `suspendido: false` explícito (default `true`). Guard de idempotencia: 409 si ya está en el estado
  pedido (evita recalcular/loggear una escritura que no cambia nada).
- **`POST /api/v1/concursos`** (S4-6, módulo nuevo `concursos/`) — el módulo de Bajas real es Sprint 5
  (S5-4/S5-5, todavía no existe `model Baja`), así que por ahora es carga manual: recibe
  cargo/hospital/origen/motivo/fechaVacante y, según `tipoConcurso`, crea en cascada (una sola
  transacción) el `ConcursoCph` (con `estado`/`subEstado` ya calculados desde el arranque — un
  concurso recién creado sin EE de baja/concurso da `VACANTE`, verificado) o el `ConcursoCeetps`
  (requiere `escalafonId`, validado con `.refine()` en el schema). Guard: no permite dos concursos CPH
  abiertos (`estado NOT IN (finalizado, desierto)`) para el mismo cargo.
- **`GET /api/v1/kpis/concursos-cph`** (S4-11) — total, agregado por `estado`, por `subEstado`
  (`groupBy` de Prisma, valor persistido), por `subEstado3` (SQL crudo, recalculado en vivo, mismo
  motivo que el filtro) y por hospital (`sigla`/`nombre` incluidos para no requerir un segundo fetch
  desde el frontend). Filtro opcional `hospitalId`.
- **Roles**: lectura para cualquier usuario autenticado (`director`/`viewer` incluidos, alineado con
  "solo lectura de su nicho" del plan); escritura (`PATCH`/`suspender`/`POST /concursos`) requiere
  `admin`/`editor`/`concursales_cph` (y `concursales_ceetps` también en `POST /concursos`, ya que ese
  endpoint es compartido entre los dos tipos de concurso).
- **`packages/types`** — `ConcursoCph` completo (antes placeholder con "...más campos según
  necesidad"), más `ConcursoCphFilters`, `PatchConcursoCphRequest`, `SuspenderConcursoCphRequest`,
  `CreateConcursoRequest` y `KpiConcursosCph` — listos para que Agustin tipe S4-7/S4-8 sin adivinar la
  forma de las respuestas (mismo patrón que `PersonaDetail`/`CargoDetail` dejaron para Sprint 3).

**Verificado contra la BD real, no solo `tsc --noEmit`** (login real, cargo real de Sprint 2/3,
`docker compose up -d --build api` para asegurar que corre el código nuevo — no la imagen vieja, ver
el hallazgo de cierre de Sprint 3 más arriba en este mismo documento):

- Crear concurso CPH sobre un cargo real sin EE todavía → `estado: no_iniciado`, `subEstado: VACANTE`.
- Segundo intento de concurso CPH sobre el mismo cargo → 409 (guard de duplicados).
- PATCH con `eeBaja`+`fechaBaja`+`eeConcurso`+`fechaEeConcurso` → `estado: activo`,
  `subEstado: A-CARATULADO` (transición automática, sin tocar `estado`/`subEstado` a mano).
- PATCH con `fechaAutorizacion`+`sorteoJurado`+`disposicion` → `subEstado: C-DISPO DE LLAMADO`,
  `subEstado3: C-INSCRIPCION`.
- PATCH mandando `estado` a mano → 400 (rechazado por `.strict()`, confirma que no es editable).
- Listado filtrado por `subEstado=C-DISPO DE LLAMADO` → 1 resultado, el correcto.
- Suspender → `suspendido: true`. Suspender de nuevo → 409 (idempotencia). Reanudar
  (`suspendido: false`) → vuelve a `activo`, conserva el `subEstado` que tenía.
- KPI: total 1, agregado correcto por estado/subEstado/subEstado3/hospital.
- Usuario `viewer` real (creado y desactivado después de la prueba): lee el concurso (200), no puede
  hacer PATCH (403) — confirma que el rol se aplica de verdad, no solo que la ruta existe.

**Un bug real encontrado en esta verificación (no lo agarró `tsc`):** la primera versión de
`patchConcursoCphService` decidía si convertir un campo del body a `Date` con una heurística
(`key.startsWith('fecha')`) — funciona para 13 de los 14 campos de fecha del PATCH, pero
`sorteoJurado` es fecha y no arranca con ese prefijo. `tsc` no lo detecta porque
`PatchConcursoCphBody` tipa todas las fechas como `string` (llegan como `"YYYY-MM-DD"` del cliente,
igual que cualquier otro campo de texto) — el error solo aparece en runtime, contra Postgres real
(`PrismaClientValidationError: premature end of input. Expected ISO-8601 DateTime`), probando con un
valor real en ese campo puntual. ✅ **Corregido** — la heurística por nombre se reemplazó por un
`Set` explícito de los 14 campos de fecha del PATCH.

**S4-7, S4-8, S4-9 y S4-10 completados y verificados por Agustin (2026-08-26) — Sprint 4 de Agustin
cerrado:**

- `ConcursosCphPage` (S4-7) — tabla siguiendo el mismo patrón que `CargosPage`/`PersonasPage`
  (búsqueda debounce 300ms, filtros combinables, paginación). Filtros: hospital, estado, subEstado,
  subEstado3, suspendido. Columna "Últ. movimiento" con badge de días desde `updatedAt`
  (verde/naranja/rojo en 0/30/60 días) como indicador liviano de estancamiento — el sistema de
  alertas completo con umbrales configurables y filtro dedicado sigue siendo S4-10, no implementado
  acá.
- `ConcursoCphDetail` (S4-8) — formulario agrupado en las mismas 6 fases que usa `calcConcursoCph`
  internamente (Baja/apertura, Autorización, Inscripción-examen-orden de mérito, IFACS/INSAL,
  Designación, Desierto) + observaciones. `estado`/`subEstado`/`subEstado3` se muestran como badges
  de solo lectura (los calcula el backend, S4-4) — el form nunca los manda en el PATCH. Botón
  suspender/reanudar. Picker de "persona designada" con búsqueda async contra
  `GET /api/v1/personas` (debounce 300ms) en vez de un `<select>` con 45k+ opciones. Solo
  `admin`/`editor`/`concursales_cph` pueden editar (`WRITE_ROLES`, igual que el backend) — el resto
  ve el formulario disabled con un aviso.
- Nuevo `.input`/`.checkbox` en `index.css` (`@layer components`) — con 27 campos en el formulario,
  repetir la clase larga de Tailwind en cada uno (como en `AdminUsuariosPage`, que tiene 4 campos) ya
  no daba; se extrajo siguiendo el mismo criterio que ya usa el archivo para `.btn-*`/`.badge-*`.
- `SubEstadoTimeline` (S4-9) — barra de progreso segmentada montada en el header de
  `ConcursoCphDetail`, sobre `subEstado3` (la vista "resumida" de 8 etapas) en vez del `subEstado`
  crudo de 19 niveles — con nombres del legacy como "H-TAD"/"K-ITE" no entra en una barra lineal
  legible. Desierto se muestra como estado propio (banner rojo), no como un 8º segmento al final de
  la progresión — el concurso no "llegó más lejos", se cayó. Suspendido atenúa la barra entera con
  aviso, sin ocultar en qué etapa quedó.
- `AlertasSinMovimiento` (S4-10) — panel en `ConcursosCphPage`, arriba de la tabla/filtros. Umbrales
  acumulativos (30+/60+/90+ días, no 3 grupos disjuntos — un concurso a 95 días cuenta en los 3).
  Solo alertan `no_iniciado`/`activo`: `suspendido` está parado a propósito (no es una alerta, es una
  decisión) y `finalizado`/`desierto` ya cerraron. `concursosCphQuerySchema` (backend) no tiene
  filtro por antigüedad de `updatedAt`, así que se trae el total de concursos CPH con
  `fetchAllPages()` (mismo helper que ya usa el export a Excel de S3-10, paginado en bloques de 200 —
  el tope de `limit` de este endpoint, a diferencia de personas/cargos) y se calculan los buckets
  client-side; volumen esperado (decenas/pocos cientos de concursos CPH, no 45k como personas) hace
  esto barato. Cada bucket es clickeable y expande la lista real de concursos afectados, con link a
  su detalle.

**Verificado contra la API real, no solo `tsc --noEmit`** (reset de la base local — el historial de
migraciones de este container había quedado inconsistente, ver hallazgo de infraestructura abajo —
seed, login real, cargo de prueba insertado a mano y borrado al final):

- `GET /api/v1/concursos-cph` con la base vacía → `ConcursosCphPage` muestra "Sin resultados para
  los filtros aplicados", sin errores; selector de hospital poblado con los 35 reales del seed.
- Creado un concurso CPH de prueba (`POST /api/v1/concursos`) → aparece en el listado con
  `estado: no_iniciado`, `subEstado: NO INICIADO`.
- `GET /api/v1/concursos-cph/:id` → forma exacta que espera `ConcursoCphDetail` (incluye
  `concurso.cargo`, `concurso.persona`, `hospital`, `personaDesignada` expandidos).
- `PATCH` con `eeConcurso`+`fechaEeConcurso`+`cargaDocumentacion:true`+`personaDesignadaId:null` →
  `estado` pasó a `activo`, `subEstado` a `I-CARGA DOCU` — confirma que el body que arma
  `toPatchBody()` (conversión de `''` a `null` para los campos vacíos del form) es aceptado por
  `patchConcursoCphSchema` tal cual.
- Suspender → `estado: suspendido`, `observaciones` guardadas. Reanudar (sin mandar `observaciones`)
  → vuelve a `activo`, conserva `observaciones` (confirma el `if body.observaciones !== undefined`
  del backend).
- Cargo, concurso y concursoCph de prueba borrados al final — la base quedó igual que antes de la
  verificación (0 concursos).
- S4-9: segundo concurso de prueba progresado con 3 `PATCH` reales (autorización+sorteo →
  disposición → `dispoDesierta`) — los 4 valores de `subEstado3` que devolvió el backend
  (`A-VALID. VCTE`, `B-AUTORIZADO`, `C-INSCRIPCION`, `H-DESIERTO`) matchean exacto contra el array
  `PASOS` del componente. Sin ese match exacto el `findIndex()` de `SubEstadoTimeline` falla en
  silencio (vuelve `-1`, la barra queda siempre en el primer segmento) — no tira error, así que
  valía la pena confirmarlo con valores reales del backend y no solo a ojo contra el código fuente
  de `concursosCph.calc.ts`. Datos de prueba borrados al final.
- S4-10: 3 concursos de prueba con `updated_at` backdateado a mano en la BD (10/35/95 días) para
  poder probar el bucketing sin esperar 3 meses reales — el de 10 días no debe alertar en ningún
  umbral, el de 35 solo en "30+", el de 95 en los 3 ("30+"/"60+"/"90+", confirma que son acumulativos
  y no disjuntos). Confirmado con `GET /api/v1/concursos-cph?limit=200` real. Datos de prueba
  borrados al final.

**Hallazgo de infraestructura (no es un bug de código, documentado para no repetir el diagnóstico):**
el container de Postgres nativo en WSL (Docker Engine directo, no Docker Desktop — ver
`Doc/ARRANQUE_LOCAL.md`, desactualizado en la ruta del proyecto para esta máquina) tenía la tabla
`_prisma_migrations` inconsistente: una migración a medio aplicar (`0_init`, interrumpida por un
intento anterior) más una migración `20260821153443_init` aplicada que no existe como carpeta en el
repo. Causa raíz probable: WSL2 apaga la VM por inactividad entre comandos — cada invocación de
`wsl.exe` desde una terminal distinta reinicia `dockerd` en frío, y con `restart: unless-stopped` los
containers vuelven a arrancar solos, lo que puede dejar una migración a mitad de camino si algo la
interrumpe en el medio. Sin datos reales para perder (0 personas/cargos, solo seed base) — resuelto
con `prisma migrate reset --force` + `pnpm db:seed`. Mitigación aplicada en esta sesión: mantener una
sesión `wsl.exe -- sleep N` en segundo plano durante secuencias de comandos que dependen de Docker.

---

### POST-SPRINT 4 — Mejoras UX padrón/personas (2026-08-27)

**Commit:** `f178819` | **Autor:** Jorge + Claude

Mejoras incrementales sobre módulos ya cerrados, surgidas de uso real con datos de producción.

#### Ocupaciones: `cargo_desde` / `cargo_hasta`

- `prisma/schema.prisma`: `cargoDesdeFecha DateTime? @map("cargo_desde") @db.Date` y `cargoHastaFecha` en `Ocupacion`
- `ALTER TABLE ocupaciones ADD COLUMN cargo_desde date, ADD COLUMN cargo_hasta date` aplicado en BD real
- `padron.service.ts`: campos agregados a `COLS_WATCH`, `CAMPOS_OCUPACION`, `calcularDiff` (JSON de diffs nuevos) y `aprobarSnapshotService` (creación de ocupaciones con `parseFechaDDMMYYYY`)
- Backfill de 48.166 ocupaciones existentes desde el último Excel exportado (`fix_cargo_fechas.py`, corrido en dotaneitor)
- `packages/types`: `Ocupacion` con `cargoDesdeFecha`/`cargoHastaFecha`; interfaz `OcupacionConCargo`
- `PersonaDetailPanel`: muestra "Cargo desde" y "Cargo hasta" cuando tienen valor
- **Fix crítico post-deploy**: el cliente Prisma en el contenedor no tenía los campos nuevos (no se había regenerado desde el último build). Rebuild de la imagen API con `docker compose up -d --build api` — `prisma generate` corre automáticamente en `postinstall`. Verificado: `cargoDesdeFecha` devuelve `"2025-01-07T00:00:00.000Z"` correctamente.

#### Export Excel de padrón: fix `ReferenceError` en runtime

- El endpoint `GET /snapshots/:id/exportar` en `padron.routes.ts` referenciaba `python` y `getSnapshotOrThrow` que son privados de `padron.service.ts` — en runtime tiraba `ReferenceError` silencioso capturado por Fastify como 500, el frontend nunca recibía el blob
- Fix: `exportarSnapshotService` extraido al service (donde `python` y `getSnapshotOrThrow` sí están disponibles) y exportado; routes lo importa y usa
- `usePadron.ts`: `useExportarSnapshot` ya usaba `responseType: 'blob'` correctamente — el bug era solo en el backend

#### Deduplicación de ocupaciones fantasma (regla SIAL)

- SIAL genera duplicados cuando una persona tiene dos filas vigentes con el mismo `codigo_repa` + `literal_puesto`, una con `codigo_jefaturas` (ej. `P60`) y otra sin — la sin jefatura es un fantasma del sistema
- `filtrarDuplicados()` en `PersonaDetailPanel`: detecta estos grupos en las ocupaciones vigentes y oculta las sin `codigoJefaturas`. Solo afecta la visualización, no toca la BD
- Verificado contra 10 casos reales en la DB (Directores, Sub-Directores con código P60/P61/etc.)
- El contador "Ocupaciones (N)" en el header refleja el total filtrado, no el total crudo

#### Filtros persistentes en `/personas`

- `PersonasPage`: reemplazado `useState` por `useSearchParams` — todos los filtros (search, hospitalId, escalafonId, activo, puesto, especialidad, page) viven en la URL como query params
- Cambios de filtro usan `setSearchParams` sin `replace: true` (agregan al historial); paginación usa `replace: true` (no llena el historial)
- Link "Ver" en la tabla pasa `state: { from: searchParams.toString() }` al navegar al detalle
- `PersonaDetailPanel`: "Volver a Personas" lee `location.state.from` y reconstruye `/personas?...` con los filtros originales. Si no hay state (acceso directo por URL), vuelve a `/personas` sin params

#### Chips de filtros activos

- Debajo de los controles de filtro en `PersonasPage`, aparecen burbujas con el label legible de cada filtro activo (sigla del hospital, nombre del escalafón, etc.) y un botón `×` para quitarlo individualmente
- Con 2+ filtros activos aparece "Limpiar todo"
- El chip de escalafón llama a `cambiarEscalafon('')` (que también limpia puesto y especialidad en cascada); el de puesto llama a `cambiarPuesto('')` (limpia especialidad)

#### Puesto en header del panel de persona

- El puesto de la ocupación vigente activa (no retención) aparece debajo del CUIL en el header azul del `PersonaDetailPanel`
- Si todas las ocupaciones vigentes son retención, muestra igual la primera vigente

#### Dotaneitor: reconexion automática a Postgres

- `pool_pre_ping=True` en el engine de SQLAlchemy — antes de cada query verifica si la conexión sigue viva y reconecta automáticamente si Postgres se reinició (el rebuild de la API reinicia el contenedor de postgres, dejando al dotaneitor con una conexión stale)
- Aplica en el próximo rebuild del contenedor dotaneitor

---

### POST-SPRINT 4 (2) — Cargos: códigos, estados, UX (2026-09)

**Autor:** Jorge + Claude

#### Generación de códigos de cargo (`Cargo.codigo`)

- `apps/api/src/shared/codigoCargo.ts` — módulo nuevo con `prefijoDeCargo()` (mapea escalafón + unificador + agrupador al prefijo correcto según `REGLAS_NEGOCIO.MD` §3) y `siguienteCodigoCargo()` (secuencial atómico por prefijo dentro de la transacción del llamador)
- Prefijos implementados: `CPH-POF`, `CPH-POU`, `CPH-J-POF`, `CPH-J-POU`, `CPH-D`, `CPH-SD`, `ENF`, `TEC-POF`, `TEC-POU`, `EG`, `EG-J`, `EG-D`, `EG-G`, `AS-MIN`, `AS-SS`, `AS-DG`, `AS-DGA`, `RG-CG`, `SG`, `RES`, `DOC`, `PT`, `CT`, `PG`
- `padron.service.ts` — `aprobarSnapshotService` genera código automáticamente al crear cargos nuevos (paso 3b post-`createMany`)
- Backfill de los ~48k cargos existentes via `scripts/backfill-codigos-cargo.sql` (PL/pgSQL, idómpotente). Distribución final: CPH-POF 24.444, TEC-POF 14.991, EG 6.620, RES 4.478, DOC 579, RG-CG 201, PT 70, CT 68, PG 58, AS-DG 43
- Fix de 196 cargos con prefijo fallback `CARGO` (escalafones `Planta Transitoria`, `Cuerpos Transitorios`, `Planta de Gabinete` no estaban en las reglas originales) — reasignados a `PT`/`CT`/`PG` via `scripts/fix-codigos-cargo-fallback.sql`

#### Estados de cargo: `no_vigente` desde datos históricos

- 3.713 cargos con ocupaciones todas cerradas (`hasta IS NOT NULL`) y sin ocupación vigente marcados como `no_vigente` via SQL directo
- `padron.service.ts` — al aprobar snapshot, los cargos "eliminados" ahora también se marcan `no_vigente` si ya no tienen ocupación vigente restante (mismo patrón que el fix de `persona.activo = false` del post-sprint anterior)
- Verificado: 0 cargos `vigente` sin ocupación activa (consistencia perfecta)

#### Búsqueda por prefijo en `/personas`

- `personas.service.ts` — reemplazado `plainto_tsquery` por `to_tsquery` con `:*` en cada token para que búsquedas parciales (ej. `lizarra`) matcheen `lizarraga`. Cada token del search se convierte en prefijo: `"juan pe"` → `juan:* & pe:*`

#### Filtros persistentes en `/cargos` (mismo patrón que `/personas`)

- `CargosPage` — `useState` → `useSearchParams`. Filtros viven en URL. Link "Ver" pasa `state: { from: searchParams.toString() }`. "Volver a Cargos" reconstruye URL desde `location.state.from`
- Nuevo filtro "Ocupación" (Ocupados y vacantes / Solo ocupados / Solo vacantes) en frontend, schema y service
- Chips de filtros activos con `×` y "Limpiar todo"

#### Columna Ocupación en tabla de cargos

- `cargos.service.ts` — `listCargosService` incluye `ocupaciones: { where: { hasta: null }, select: { id: true }, take: 1 }` y mapea a `ocupado: boolean`
- `CargosPage` — columna "Ocupación" con badge verde (Ocupado) o naranja (Vacante)
- `packages/types` — `Cargo.ocupado: boolean`

#### Mejoras al detalle de cargo (`CargoDetailPanel`)

- Encabezado: ID SIAL en gris pequeño, código cargo grande, puesto, especialidad. Dos badges: Vigente/No vigente + Ocupado/Vacante
- Sección Clasificación solo aparece si hay al menos un campo con dato
- Persona actual: nombre grande con DNI, badge de estado, "En el cargo desde" usa `cargoDesdeFecha` (más completo que `desde`), jefatura solo si tiene código
- Historial de personas: tabla con todas las ocupaciones cerradas del cargo (nombre, CUIL, desde, hasta, situación de revista, link "Ver")
- `cargos.service.ts` — `getCargoByIdService` trae todas las ocupaciones (no solo la vigente) y las separa en `ocupacionActual` + `historial`
- `packages/types` — `CargoDetail.historial: (Ocupacion & { persona: Persona })[]`

#### Link "Ver cargo" desde ocupaciones de persona

- `PersonaDetailPanel` — cada ocupación tiene botón "Ver cargo" que navega a `/cargos/:id` del cargo correspondiente

---

### POST-SPRINT 4 (3) — Mejoras UX personas/cargos (2026-08-28)

**Commit:** pendiente | **Autor:** Jorge + Claude

#### Retención de cargo: "Cubre en" en `CargoDetailPanel`

- `cargos.service.ts` — `getCargoByIdService`: cuando `ocupacionActual.situacionRevista === 'Retencion de Cargo'`, busca la ocupación `Activo` de esa persona en otro cargo e incluye `cargoActivo` en la respuesta
- `packages/types` — `CargoDetail.cargoActivo: (Ocupacion & { cargo: Cargo & { hospital, escalafon } }) | null`
- `CargoDetailPanel` — sección "Cubre en" con fondo ámbar cuando hay retención: muestra código cargo, puesto, hospital y link "Ver cargo activo". Si retiene pero no tiene cargo activo registrado, muestra "Retiene este cargo — sin cargo activo registrado"
- Verificado con datos reales: Ferraro (CPH-POF-008656, Jefe UTI Durand) retuvo y cubre CPH-POF-022449 (Director CSMA)

#### Filtro por puesto en `/cargos`

- `cargos.service.ts` — `listPuestosCargosService(escalafonId?, hospitalId?)`: puestos distintos filtrados en cascada
- `cargos.routes.ts` — `GET /api/v1/cargos/puestos` con params opcionales `escalafonId`/`hospitalId`
- `cargos.schema.ts` — campo `puesto` opcional en query schema
- `useCatalogos.ts` — hook `usePuestosCargos(escalafonId?, hospitalId?)`
- `CargosPage` — `SearchableSelect` para puesto (igual que `/personas`); al cambiar hospital o escalafón se limpia el puesto (cascada); chips de filtros activos actualizados
- `packages/types` — `CargoFilters.puesto?: string`

#### Mejoras al `PersonaDetailPanel`

- **ID SIAL de persona**: extraído del primer segmento de `idSialRol` (ej. `001608093` de `001608093-2-27204383680`), mostrado en sección Identificación
- **ID SIAL Rol en cada cargo**: `001608093-2` (persona + número de cargo, sin CUIL)
- **Código Cargo** en cada ocupación
- **Zócalo "Datos de la persona"** sobre el header navy
- **Zócalo "Detalle de cargos"** sobre la sección de ocupaciones
- **Header**: `Rol actual: Director (01)` + `Especialidad: Psiquiatria` (solo si tiene)
- **Orden de cargos**: Vigente → Retención → Histórica
- **Sangría de color** en cada cargo: verde (activo), ámbar (retención), rojo claro (histórico). Clases CSS explícitas en `index.css` para evitar purge de Tailwind
- **Badge "Retención"** en ámbar (`badge-amber` nuevo en `index.css`)
- **Campos reorganizados** por columna: Código Cargo / ID SIAL Rol / Escalafón / Puesto / Especialidad — Hospital / Régimen / Situación de revista / Estado — Repartición (código + descripción unificados) / Documentación del rol / Cargo desde / Cargo hasta
- Eliminados campos redundantes: `Estado` (igual a `Situación de revista`), `Cód. situación`
- `Escalafón` muestra el literal del `codigoRegistro` (ej. `Nueva Carrera Prof. Hosp`); `Régimen` muestra el código (ej. `37`)
- `Repartición` unifica código + descripción en un campo (`40220629 — UNID Psicopatología y Salud Mental`)

---

### POST-SPRINT 4 (4) — Maquetas Alta/Baja/Alta por Baja (2026-09)

**Autor:** Jorge + Claude

Maquetas funcionales de las tres páginas del módulo de gestión de cargos. Sin lógica de backend — datos mock, formularios interactivos, historial ordenado. Base para implementación real en Sprint 5.

#### `/cargos/alta` — Alta de Cargos

- `AltaCargosPage.tsx` — reemplaza el Placeholder
- Tres botones en el header: **Cargo de Ejecución POF**, **Cargo de Ejecución POU**, **Cargo por Estructura**
- Al tocar un botón se despliega el formulario inline debajo (toggle: mismo botón cierra, otro botón cambia). Botón activo con `ring-2 ring-secondary`
- Formulario por tipo: expediente/decreto (con confirmación verde) → hospital → carrera (botones CPH/EG/ENF/TEC/AS) → puesto → especialidad (condicional CPH/TEC) → fecha desde + cantidad (±) → Cancelar / Registrar
- Al registrar: alta aparece al tope del historial, formulario se cierra
- Historial con buscador (hospital, carrera, puesto, expediente, tipo), tabla ordenada de más reciente a más viejo, badges de tipo (Ejecución POF azul / Ejecución POU gris / Estructura naranja)

#### `/cargos/baja` — Baja de Cargos

- `BajaCargosPage.tsx` — reemplaza el Placeholder
- Mismo maquetado que Alta por Baja: header con título + botón **Nueva Baja** (rojo), buscador, tabla historial
- Columnas: Fecha, Código Cargo, Puesto, Hospital, Escalafón, Motivo, Estado
- Estados: Pendiente (naranja) / Confirmada (verde) / Anulada (rojo)
- 9 registros mock ordenados de más reciente a más viejo

#### `/cargos/alta-por-baja` — Alta por Baja

- `AltaPorBajaPage.tsx` — reemplaza el Placeholder
- Header con título + botones **Nueva Baja** (outline) y **Nuevo Concurso** (primary)
- Buscador por código, puesto, hospital, persona
- Tabla con columnas: Fecha, Tipo (Baja rojo / Concurso azul), Código Cargo, Puesto, Hospital, Persona, Motivo, Estado
- 9 registros mock ordenados de más reciente a más viejo

#### Análisis de datos reales — `base_concursos_limpio.csv`

Revisado el CSV de Alexis con 7.471 concursos CPH reales para informar el diseño del Sprint 5:

| Dimensión              | Hallazgo clave                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Volumen**            | 7.471 concursos totales. 5.095 finalizados (68%), 1.302 activos (17%), 569 no iniciados (8%), 505 suspendidos (7%)                                                                                                        |
| **Sub-estado 3**       | G-RESOLUCION 5.094 (68%), A-VALID.VCTE 1.249 (17%), B-AUTORIZADO 262, H-DESIERTO 227, D-ETAPA EVAL 220, F-PROX.A DESIG 195, E-ADJUDI 163, C-INSCRIPCION 60                                                                |
| **Escalafón**          | POF 3.943 (53%), POU 3.096 (41%), sin dato 432 (6%) — solo CPH, confirma que el módulo es exclusivo de esa carrera                                                                                                        |
| **Tipo de baja**       | 7.233 sin tipo registrado (97%) — el campo `tipo_de_baja` está casi vacío en los datos reales. Los 238 con dato: Cargo retenido 161, Interino 27, Jubilación 12, Cambio de Efector 10, Renuncia 9, Pase a Planta 9, otros |
| **Cargo baja**         | 1.632 concursos sin `cargo_baja` (22%) — vacantes generadas por ampliación de dotación, no por baja de persona                                                                                                            |
| **Tipificador origen** | Bajas 2025 1.494, Bajas 2024 1.262, Bajas 2023 1.203, Bajas 2026 878, Ampliación 2022 422, Ampliación 2026 398, Bajada Odoo 228, Art. 48, Obra, Cobertura Dotación                                                        |

**Decisiones de diseño para Sprint 5 derivadas del análisis:**

- El campo `tipo_de_baja` es opcional — la mayoría de los concursos reales no lo tienen. No debe ser requerido en el formulario
- `cargo_baja` también es opcional — hay concursos por ampliación sin baja de persona asociada
- El tipificador de origen (`tipificador_1_origen`) es un campo libre importante para trazabilidad — incluir en el modelo `Baja`
- Los tipos de baja reales son: Cargo retenido, Interino, Jubilación, Cambio de Efector, Renuncia, Pase a Planta, CC POU a POF, CC POF a POU, Jefatura, Fallecimiento — usar como enum o lista sugerida (no obligatoria)
- El flujo real no siempre es "baja → concurso": hay concursos por ampliación de dotación sin baja previa. El modelo debe soportar `baja_id` nullable en `ConcursoCph`

---

### SPRINT 5 — Concursos CEETPS + Bajas

**Duración:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Módulo CEETPS y flujo baja → concurso funcional.

| #     | Tarea                                                                                                                            | Dev     | Est. | Prioridad  |     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S5-1  | `GET/PATCH /api/v1/concursos-ceetps` con filtros                                                                                 | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S5-2  | ConcursosCeetpsPage: tabla con estado, escalafón, filtros                                                                        | Agustin | 10h  | 🔴 Crítico | ✅  |
| S5-3  | ConcursoCeetpsDetail: formulario por fases ENF/TEC/EG                                                                            | Agustin | 10h  | 🔴 Crítico | ✅  |
| S5-4  | Módulo Bajas: `POST /api/v1/bajas` — modelo `Baja` nuevo en schema, endpoint de creación                                         | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S5-5  | Lógica: baja con `genera_concurso` → crea seguimiento automático (llama a `createConcursoService` internamente)                  | Jorge   | 6h   | 🔴 Crítico | ✅  |
| S5-6  | BajasPage: tabla + formulario nueva baja                                                                                         | Agustin | 8h   | 🔴 Crítico | ✅  |
| S5-7  | Conexión baja → cargo: marcar cargo `no_vigente` al registrar baja                                                               | Jorge   | 4h   | 🔴 Crítico | ✅  |
| S5-8  | `GET /api/v1/kpis/concursos-ceetps` para tablero                                                                                 | Jorge   | 3h   | 🟡 Medio   | ✅  |
| S5-9  | Alertas CEETPS: concursos sin movimiento                                                                                         | Agustin | 3h   | 🟡 Medio   | ✅  |
| S5-10 | **Alta de Cargo manual** (B-11 promovido): crear cargo nuevo a mano con generación de `Cargo.codigo` según nomenclatura heredada | Jorge   | —    | 🔴 Crítico | ✅  |

**Criterio de éxito:**

- Rijana puede gestionar concursos CEETPS desde la app — ✅
- Una baja genera automáticamente el seguimiento correspondiente — ✅
- El cargo se marca `no_vigente` al registrar la baja — ✅
- Alta de Cargo manual funciona con generación de código según nomenclatura heredada — ✅

**Backend (Jorge) — commits `c968744`, `c64c9a7`, `b13aebe`, `40f2251`:**

- **S5-1** — `concursos-ceetps/` completo: `listConcursosCeetpsService` + `getConcursoCeetpsByIdService` + `patchConcursoCeetpsService`. `calcEstadoCeetps()` server-side en cada write. Filtros: `hospitalId`, `escalafonId`, `estado`, `search`. Include completo con relaciones expandidas. Schema Zod con `.strict()` — `estado` no editable por el cliente.
- **S5-4** — `model Baja` + `EstadoBaja` enum (`pendiente`/`confirmada`/`anulada`) en schema Prisma. Migración `sprint5_bajas_ceetps` aplicada en BD real. Módulo `bajas/` completo (schema/service/routes). `tipoBaja` y `tipificadorOrigen` opcionales (97% vacío en datos reales). `bajaId` nullable en `Concurso`.
- **S5-7** — integrado en `createBajaService` dentro de la misma transacción: marca `Cargo.estado = no_vigente` al registrar la baja.
- **S5-5** — `createConcursoTx(tx, body, usuarioId, bajaId?)` extraída como función pública de `concursos.service.ts`. `createBajaService` la llama dentro de su `$transaction` cuando `generaConcurso: true`. Schema de baja actualizado con `tipoConcurso` (requerido si `generaConcurso=true`) y `escalafonId` (requerido si `tipoConcurso=ceetps`). Verificado end-to-end.
- **S5-8** — `getKpisConcursosCeetpsService`: total, `porEstado` (groupBy Prisma), `porEscalafon` y `porHospital` (raw SQL). Filtros opcionales `hospitalId`/`escalafonId`. Endpoint `GET /api/v1/kpis/concursos-ceetps`.
- **S5-10** — `createCargoSchema` + `createCargoService`: usa `prefijoDeCargo` + `siguienteCodigoCargo` en transacción, crea N cargos en lote con `idSial = MANUAL-{codigo}`. `POST /api/v1/cargos` con `requireRole([ADMIN, EDITOR])`. Verificado end-to-end: `cantidad=2` generó `CPH-POF-024445` y `CPH-POF-024446` correctamente.

**Frontend (Agustin) — commits `aad25b3`, `5919929`:**

- **S5-2** — `ConcursosCeetpsPage`: tabla con filtros por hospital/escalafón/estado, búsqueda debounce 300ms, paginación. Mismo patrón que `ConcursosCphPage`.
- **S5-3** — `ConcursoCeetpsDetail`: formulario con los campos del modelo CEETPS (expediente, puesto solicitado, disposición de llamado, IFACS/INSAL, designación). Estado como badge de solo lectura. Solo `WRITE_ROLES` pueden editar.
- **S5-6** — `BajaCargosPage` reescrita conectada a API real: `useBajas` hook, tabla de historial real, formulario de nueva baja con `useMutation`. Fix posterior (`5919929`) para adaptar al contrato de S5-5 (campos `tipoConcurso`/`escalafonId` condicionales).
- **S5-9** — `AlertasSinMovimientoCeetps`: mismo patrón que `AlertasSinMovimiento` de CPH, umbrales 30+/60+/90+ días sobre concursos CEETPS `sin_autorizar`/`autorizado`/`en_proceso`.
- **`AltaCargosPage`** — reescrita conectada a API real: `useHospitales`, `useEscalafones`, `usePuestosCargos` para selectores. `useMutation` para `POST /api/v1/cargos`. Historial de sesión muestra códigos generados.

**Merges:**
- `jorge → main`: commits S5-1/S5-4/S5-7 (merge `4470b4c`), luego S5-5/S5-8/S5-10 + contratos (merge `215e810`)
- `Agustin → develop → main`: S5-2/S5-3/S5-6/S5-9 (merge `9d39069`)
- `develop` sincronizado con `main` en cada ciclo

---

### SPRINT 6 — Tablero KPIs + cierre MVP

**Duración:** 1 semana | **Capacidad:** 60h
**Objetivo:** Dashboard operativo con KPIs reales y sistema listo para producción.

| #    | Tarea                                                                           | Dev             | Est. | Prioridad  | Estado |
| ---- | ------------------------------------------------------------------------------- | --------------- | ---- | ---------- | ------ |
| S6-0 | *(no planificada)* Prerequisito `PadronHistorico`: `cuil`/`unificadorPuesto`/índice `cargoId` | Jorge | — | 🔴 Crítico | ✅ |
| S6-1 | `GET /api/v1/kpis/dotacion`: total vigentes, vacantes, por carrera, por efector | Jorge           | 6h   | 🔴 Crítico | ✅ |
| S6-2 | KpisPage: cards con borde amarillo, skeleton loading                            | Agustin         | 6h   | 🔴 Crítico | ✅ |
| S6-3 | KPIs concursales: por sub-estado, tiempo promedio por etapa                     | Jorge           | 6h   | 🔴 Crítico | ✅ |
| S6-4 | Filtro por hospital en todo el tablero                                          | Agustin         | 4h   | 🟡 Medio   | ✅ |
| S6-5 | Gráfico evolución dotación histórica (padron_historico)                         | Agustin         | 6h   | 🟡 Medio   | ✅ |
| S6-6 | Alertas activas: concursos vencidos, bajas sin concurso                         | Jorge           | 4h   | 🟡 Medio   | ✅ |
| S6-7 | Preparar docker-compose de producción                                           | Jorge           | 4h   | 🔴 Crítico | ✅ |
| S6-8 | Smoke test completo del sistema                                                 | Jorge + Agustin | 4h   | 🔴 Crítico | ✅ |

**Criterio de éxito:**

- Tablero carga en < 3 segundos
- KPIs reflejan datos reales del padrón aprobado
- Sistema listo para deploy en servidor propio

---

### SPRINT 7 — Cargos: trazabilidad del alta manual

**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 56h
**Objetivo:** Cerrar los gaps de trazabilidad del alta manual de cargos (RF-11 a RF-15 de `Doc/Contratos_Paginas/cargos_alta.md`), de modo que **todo alta de cargo quede respaldada por su acto administrativo en BD** y sea auditable.

**Problema actual:** el frontend de `/cargos/alta` envía `expediente` y `desde` al backend, pero `createCargoService` los descarta silenciosamente porque el modelo `Cargo` no tiene esas columnas. El acto administrativo que respalda el alta se pierde (solo vive en el historial de sesión del frontend, que se borra al recargar).

**Contexto — orígenes de alta de cargo:** un cargo solo puede crearse por **4 vías** en todo el sistema — Ejecución POF, Ejecución POU y Estructura (manuales, `/cargos/alta`) y el Padrón semanal SIAL (automática, al aprobar snapshot). La "alta con contrapartida de baja" **no es un origen de cargo**: el cargo estructural y su historia persisten, solo se reemplaza la persona que lo ocupa (movimiento de ocupación, flujo de bajas). Mapa completo en `Doc/Contratos_Paginas/cargos_alta.md`.

**Alcance:**

- **Dentro:** persistencia de `expediente`/`decreto` y `fechaDesde` en `cargos` (RF-11/RF-12) · auditoría del alta con usuario (RF-13) · historial persistente consultable por expediente (RF-14) · validación de duplicado estructural con advertencia (RF-15)
- **Fuera:** origen automático (Padrón SIAL — tiene su propio flujo y documentación) · movimientos de ocupación (bajas, designaciones) · cambios en la generación de códigos de cargo (ya funciona, S5-10)

| #     | Tarea                                                                                                                                                                                                     | Dev             | Est. | Prioridad  | RF          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ---------- | ----------- |
| S7-1  | Migración Prisma: `expediente` (VARCHAR 100, nullable), `fechaDesde` (DATE, nullable) y `createdById` (UUID FK → Usuario, nullable) en `cargos`. Aplicar en BD real                                       | Jorge           | 4h   | 🔴 Crítico | RF-11/12/13 |
| S7-2  | `createCargoService`: persistir `expediente`, `fechaDesde` y `createdById` (del token) en cada cargo creado del lote                                                                                       | Jorge           | 4h   | 🔴 Crítico | RF-11/12/13 |
| S7-3  | Backfill doc: cargos manuales existentes (`idSial LIKE 'MANUAL-%'`) quedan con `expediente`/`fechaDesde` NULL — documentar decisión (el dato perdido no se puede recuperar)                                 | Jorge           | 2h   | 🟡 Medio   | RF-11/12    |
| S7-4  | `GET /api/v1/cargos/altas?expediente=&desde=&hasta=`: lista altas manuales con filtro por expediente y rango de fechas, incluye usuario y códigos generados                                                 | Jorge           | 6h   | 🟡 Medio   | RF-14       |
| S7-5  | Validación de duplicado estructural en `createCargoService`: antes de crear, buscar cargo vigente con mismo `(hospitalId, escalafonId, codigoRegistroId, literalPuesto)`. Responder `409` con el cargo existente | Jorge           | 6h   | 🟢 Bajo    | RF-15       |
| S7-6  | `createCargoSchema` (Zod): `expediente` y `desde` pasan de opcionales-descartados a persistidos; tests del service                                                                                          | Jorge           | 4h   | 🔴 Crítico | RF-11/12    |
| S7-7  | Frontend: manejar respuesta `409` de duplicado — modal de advertencia con el cargo existente (código, puesto, hospital) y botones "Crear de todos modos" / "Cancelar"                                       | Agustin         | 8h   | 🟢 Bajo    | RF-15       |
| S7-8  | Frontend: reemplazar historial de sesión por historial persistente (`GET /api/v1/cargos/altas`) con buscador por expediente. Fallback de sesión mientras carga                                              | Agustin         | 10h  | 🟡 Medio   | RF-14       |
| S7-9  | Frontend: mostrar `expediente` y `fechaDesde` en el detalle del cargo (`CargoDetailPanel`) para que el dato persistido sea visible                                                                          | Agustin         | 4h   | 🟡 Medio   | RF-11/12    |
| S7-10 | Verificación end-to-end: alta POF/POU/Estructura con expediente → recargar página → el expediente sigue visible en historial y detalle. Actualizar `cargos_alta.md` (RF-11 a RF-15 → ✅)                    | Jorge + Agustin | 4h   | 🔴 Crítico | Todos       |

**Dependencias entre tareas:**

```
S7-1 (migración) ──► S7-2 (service) ──► S7-6 (schema + tests)
                   └─► S7-3 (backfill / doc)
S7-2 ──► S7-4 (endpoint altas) ──► S7-8 (frontend historial)
S7-2 ──► S7-5 (duplicados) ──► S7-7 (frontend modal 409)
S7-2 ──► S7-9 (detalle cargo)
Todo ──► S7-10 (verificación + docs)
```

> **División sugerida:** Jorge arranca con S7-1 → S7-2 (bloquean todo lo demás). Agustin puede adelantar S7-9 (solo lectura de campos nuevos) y el maquetado del modal de S7-7 con datos mock mientras Jorge termina el backend.

**Criterio de éxito:**

- Un cargo dado de alta manualmente guarda su expediente/decreto en BD y sobrevive a un reload ✅
- La fecha "desde" queda persistida como fecha de inicio de vigencia ✅
- Cada alta manual registra qué usuario la hizo ✅
- Se puede consultar el historial de altas por expediente sin depender de la sesión ✅
- Intentar crear un cargo duplicado estructural muestra advertencia antes de crear ✅
- Contrato `cargos_alta.md` actualizado: RF-11 a RF-15 en estado ✅ ✅

**Post-Sprint 7 — Mejoras UX y datos (Jorge, 2026-08-10):**

- **Filtrado escalafones por tipo de alta**: `filtrarEscalafones()` con sets `ESC_POF` (4), `ESC_POU` (5), `ESC_ESTRUCTURA` (4). Escalafón General en POF/POU muestra opción única "Anexo 2" (`unificadorPuesto: 'ambos'`) en lugar de las 4 opciones de conducción — esas solo aparecen en Estructura.
- **Puestos Anexo 2 completados**: insertados `Camillero` y `Conductor de Furgon` en BD. Lista final: 11 puestos (Ayudante de Laboratorio, Camillero, Capellan, Chofer de Ambulancia, Conductor de Furgon, Cuidador Enfermero de Animales, Hermana de Caridad, Morguero, Oxigenista, Radio Operador, Radio Operador de Emergencias).
- **Label Hospital → Sigla**: cambiado en `FormAlta`. Endpoint devuelve 61 efectores activos ordenados por sigla.
- **Historial reemplazado**: tabla agrupada por expediente (una fila por expediente), modal de detalle con datos del alta + tabla de cargos, botón "Descargar PDF" que genera documento A4 estilo resolución GCBA con `jspdf` + `jspdf-autotable`.
- **Limpieza escalafones**: escalafón `CPH` duplicado (0 cargos) eliminado de BD. `Médicos` renombrado a `Carrera Profesional Hospitalaria`. Seed actualizado. Alias `Médicos→CPH` eliminado del frontend.
- **26 puestos nuevos**: insertados para 7 escalafones sin puestos normalizados (Residentes, Docentes, Carrera Gerencial, Planta Transitoria, Cuerpos Transitorios, Planta de Gabinete, Autoridades Superiores).
- **Menú lateral reorganizado**: orden definitivo — Tablero KPIs / Personas / Cargos▼ / Bajas / ── / Concursos CPH / Concursos CEETPS / ── / Padrón Semanal / Bajas Consolidadas / Administración. Padrón Semanal y Bajas Consolidadas movidos a sección admin (debajo del segundo divisor). Página de inicio al login: `/kpis`.
- **Limpieza BD**: 5 bajas de prueba eliminadas + 4 concursos asociados (CPH-POF-012680, CPH-POF-015695, PT-000060, CPH-POF-004374, CPH-POF-004733). Tablas `bajas` y `concursos` en 0 registros.

---

### SPRINT 8 — Estado `validacion_vacante` + Validación de Bajas

**Duración:** 1 semana | **Autor:** Jorge
**Objetivo:** Implementar el estado intermedio `validacion_vacante` en el flujo del padrón y la página de validación de bajas.
**Estado:** ✅ Implementado (Sprint 8-A y 8-B completos)

#### Diagnóstico previo — estado de la BD (2026-08-10)

| Problema | Causa raíz | Fix aplicado |
|----------|-----------|--------------|
| 4 cargos `no_vigente` con ocupación activa (`hasta IS NULL`) | Bajas de prueba eliminadas directamente de BD sin revertir el `estado` del cargo ni cerrar la ocupación | `UPDATE ocupaciones SET hasta = '2026-08-18'` para los 4 casos |
| 13 cargos `vigente` sin ocupación (todos `MANUAL-*`) | Cargos de prueba creados manualmente, nunca tuvieron persona | `DELETE FROM cargos` — eran datos de prueba |

**Estado post-fix:**

| Métrica | Valor |
|---------|-------|
| Cargos `vigente` | 47.835 |
| Cargos `no_vigente` | 3.717 |
| `no_vigente` con ocupación activa | **0** ✅ |
| `vigente` sin ocupación activa | **0** ✅ |

#### Reglas de negocio definitivas (acordadas con Jorge, 2026-08-10)

**Estados del cargo:**

```
vigente            → cargo activo en la estructura
no_vigente         → estado terminal, solo por acto administrativo manual
validacion_vacante → estado intermedio, solo generado por el padrón semanal
```

**Cuándo pasa a cada estado:**

| Evento | Estado resultante | Quién lo hace |
|--------|------------------|---------------|
| Alta de cargo (manual o padrón) | `vigente` | Sistema |
| Padrón detecta "eliminado" (persona desaparece del Excel) | `validacion_vacante` | Padrón automático |
| Operador confirma la baja desde Validación de Bajas | `no_vigente` | Manual |
| Operador rechaza desde Validación de Bajas | `vigente` (vuelve) | Manual |
| Baja manual desde `/cargos/baja` o `/cargos/alta-por-baja` sin concurso | `no_vigente` | Manual |
| Reemplazo de persona desde `/cargos/baja/nueva` | `vigente` (se mantiene) | Manual |

**Qué pasa con la ocupación en cada transición:**

| Evento | Ocupación |
|--------|-----------|
| Padrón detecta "eliminado" → `validacion_vacante` | **Se cierra** (`hasta = fecha del padrón`). La persona ya no figura en el Excel = ya no ocupa el cargo. |
| Operador confirma baja → `no_vigente` | Ya estaba cerrada. Se registra el acto administrativo. |
| Operador rechaza → `vigente` | Se reabre la ocupación (`hasta = NULL`) si el rechazo es por error del sistema. |
| Reemplazo de persona → cargo sigue `vigente` | Se cierra ocupación anterior + se crea nueva ocupación. |

**Caso especial: padrón siguiente trae de vuelta a la persona:**
- El padrón **no se puede aprobar** hasta resolver estos casos
- Se genera una alerta bloqueante en la pantalla de aprobación del padrón
- El operador valida uno por uno: confirmar (cargo vuelve a `vigente`, se reabre ocupación) o mantener en `validacion_vacante`

**`validacion_vacante` y concursos:**
- Un cargo en `validacion_vacante` **NO puede generar concurso** directamente
- Primero debe confirmarse la baja (→ `no_vigente`) o hacerse un reemplazo (→ `vigente`)
- Desde `/cargos/baja/nueva` se pueden seleccionar cargos `validacion_vacante` Y `vigente` para el flujo de reemplazo

#### Sprint 8-A — Migración y lógica

| # | Tarea | Estado | Descripción |
|---|-------|--------|-------------|
| S8A-1 | **Migración enum** | ✅ | `EstadoCargo` extendido con `validacion_vacante` + columna `estado_desde DATE` en `cargos`. SQL directo (shadow DB fallaba por FK en migración vieja). Migración `20260819000000_s8a_validacion_vacante` creada y marcada como aplicada. |
| S8A-2 | **Padrón: cambiar lógica "eliminados"** | ✅ | `aprobarSnapshotService`: "eliminados" pasan a `validacion_vacante` + `estadoDesde = fechaAsignada` en lugar de `no_vigente`. |
| S8A-3 | **Padrón: alerta bloqueante** | ✅ | `getConflictosValidacionService` en `padron.service.ts` — busca diffs "nuevo" cuyos `id_sial` corresponden a cargos en `validacion_vacante`. Endpoint `GET /snapshots/:id/conflictos-validacion`. `PadronDiffPage` bloquea aprobación si hay conflictos, muestra panel naranja con tabla y botones confirmar/rechazar por fila. Badge en botón "Aprobar" con cantidad de conflictos. |
| S8A-4 | **`/cargos/baja/nueva`: incluir `validacion_vacante`** | ✅ | `ModalBuscarCargo` hace 2 queries paralelas (vigente + validacion_vacante). Badge "En validación" naranja en tabla del modal. |
| S8A-5 | **Fix `CargosPage`**: mostrar `validacion_vacante` | ✅ | Badge naranja "En Validación", opción en filtro de estado, columna "Días" para cargos no vigentes. |

#### Sprint 8-B — Página Validación de Bajas

| # | Tarea | Estado | Descripción |
|---|-------|--------|-------------|
| S8B-1 | **Ruta nueva** `/bajas/validacion` | ✅ | Ruta agregada en `router.tsx`. Link "⚠️ Validación de Bajas" en menú lateral (`AppShell.tsx`). |
| S8B-2 | **Backend**: `GET /api/v1/bajas/validacion` | ✅ | `listValidacionService()` — lista cargos en `validacion_vacante` con última ocupación cerrada y días en estado. |
| S8B-3 | **Backend**: `POST /api/v1/bajas/validacion/:cargoId/confirmar` | ✅ | `confirmarValidacionService(cargoId, actaAdministrativa?)` — cargo → `no_vigente`, `estadoDesde = hoy`, acto administrativo opcional. |
| S8B-4 | **Backend**: `POST /api/v1/bajas/validacion/:cargoId/rechazar` | ✅ | `rechazarValidacionService(cargoId)` — cargo → `vigente`, `estadoDesde = null`, reabre ocupación (`hasta = NULL`). |
| S8B-5 | **Frontend**: `ValidacionBajasPage` | ✅ | Tabla con días coloreados (verde/naranja/rojo según umbral 14/30 días). Modales confirmar (con campo acto administrativo opcional) y rechazar. |

**Criterio de éxito:**

- El padrón ya no marca cargos directamente como `no_vigente` — pasan por `validacion_vacante` ✅
- La aprobación del padrón se bloquea si hay cargos en `validacion_vacante` que reaparecen ✅
- El operador puede confirmar o rechazar cada baja desde `/bajas/validacion` ✅
- `CargosPage` muestra el estado `validacion_vacante` con badge naranja y días en estado ✅
- Build limpio: `pnpm --filter @srrhh/api build` y `pnpm --filter web build` sin errores ✅

#### Flujo completo del estado `validacion_vacante`

```
PADRÓN SEMANAL
  ↓ detecta id_sial_rol "eliminado"
  ↓ cierra ocupación (hasta = fecha_padron)
  ↓ cargo.estado = 'validacion_vacante'
  ↓ aparece en /bajas/validacion

OPERADOR en /bajas/validacion
  ├── CONFIRMAR BAJA
  │     ↓ cargo.estado = 'no_vigente'
  │     ↓ registra acto administrativo (opcional)
  │     ↓ puede generar concurso si corresponde
  │
  ├── RECHAZAR (error de sistema)
  │     ↓ cargo.estado = 'vigente'
  │     ↓ reabre ocupación (hasta = NULL)
  │
  └── (sin acción) → cargo queda en validacion_vacante

DESDE /cargos/baja/nueva (reemplazo de persona)
  ↓ selecciona cargo validacion_vacante o vigente
  ↓ cierra ocupación anterior (si existe)
  ↓ crea nueva ocupación
  ↓ cargo.estado = 'vigente'
  ↓ historial del cargo se preserva

SIGUIENTE PADRÓN (si trae de vuelta a la persona)
  ↓ detecta id_sial_rol de cargo en validacion_vacante
  ↓ BLOQUEA aprobación del padrón
  ↓ operador resuelve uno por uno antes de aprobar
```

#### Decisiones de diseño (respondidas 2026-08-19)

| Pregunta | Decisión |
|----------|----------|
| ¿Acto administrativo obligatorio? | **Opcional** — el número de documento puede quedar vacío |
| ¿Desde Validación se puede iniciar concurso? | **No** — solo confirmar o rechazar la baja. El concurso se inicia desde el flujo habitual después |
| ¿`validacion_vacante` en tabla `/cargos` o sección separada? | **En la tabla principal** con badge "En Validación" (naranja), filtrable como estado |
| ¿Alerta de antigüedad? | **Mostrar días en estado actual** en la tabla y en Validación de Bajas |

#### Estado técnico post-implementación

**Archivos modificados:**

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | `EstadoCargo` enum con `validacion_vacante`. `Cargo.estadoDesde DateTime?` |
| `prisma/migrations/20260819000000_s8a_validacion_vacante/migration.sql` | `ALTER TYPE + ADD COLUMN` |
| `packages/types/src/index.ts` | `EstadoCargo.VALIDACION_VACANTE`, `Cargo.estadoDesde: string \| null` |
| `apps/api/src/modules/padron/padron.service.ts` | Paso 4 usa `validacion_vacante`. Nueva `getConflictosValidacionService` |
| `apps/api/src/modules/padron/padron.routes.ts` | `GET /snapshots/:id/conflictos-validacion` |
| `apps/api/src/modules/bajas/bajas.service.ts` | 3 nuevas funciones: `listValidacionService`, `confirmarValidacionService`, `rechazarValidacionService` |
| `apps/api/src/modules/bajas/bajas.routes.ts` | 3 rutas S8B + 2 rutas S8A-3 |
| `apps/api/src/modules/cargos/cargos.service.ts` | `listCargosService` devuelve `estadoDesde` |
| `apps/api/src/shared/codigoCargo.ts` | `TxClient` tipado explícito con `Omit<PrismaClient, ...>` (fix TS) |
| `apps/web/src/modules/cargos/pages/CargosPage.tsx` | Badge naranja, filtro, columna "Días" |
| `apps/web/src/modules/cargos/pages/NuevaBajaPage.tsx` | 2 queries paralelas, badge "En validación" |
| `apps/web/src/modules/bajas/pages/ValidacionBajasPage.tsx` | Página nueva completa |
| `apps/web/src/modules/padron/pages/PadronDiffPage.tsx` | Panel bloqueante, query conflictos, badge botón Aprobar |
| `apps/web/src/app/router.tsx` | Ruta `/bajas/validacion` |
| `apps/web/src/shared/components/layout/AppShell.tsx` | Link "⚠️ Validación de Bajas" |

**Fix técnico: `prisma generate` faltante:**

Después de aplicar la migración S8A-1, el cliente Prisma no fue regenerado. Esto causaba que `Prisma.sql`, `Prisma.join`, `Prisma.BajaInclude`, `Prisma.CargoWhereInput` y otros tipos generados no existieran, rompiendo el build de toda la API con ~80 errores TS. Resuelto con `pnpm --filter @srrhh/api exec prisma generate`. El `postinstall` del `package.json` raíz ya corre `prisma generate` automáticamente — el problema ocurrió porque la migración se aplicó con SQL directo sin pasar por `migrate dev`.

**Regla derivada:** siempre correr `prisma generate` después de cualquier cambio al schema, incluso cuando la migración se aplica con SQL directo.

**Build verificado:**
- `pnpm --filter @srrhh/api build` → ✅ sin errores
- `pnpm --filter web build` → ✅ sin errores (592 módulos, warning de chunk >500kB preexistente)

---

### SPRINT 8-C — Triangulación histórica (pendiente)

| # | Tarea | Descripción |
|---|-------|-------------|
| S8C-1 | **`CargoDetailPanel`**: historial completo | Mostrar todas las ocupaciones históricas + concursos asociados al cargo |
| S8C-2 | **`PersonaDetailPanel`**: cargos históricos | Mostrar todos los cargos que ocupó la persona (activos, retenidos, históricos) con fechas |
| S8C-3 | **Endpoint triangulación** | `GET /api/v1/cargos/:id/historial` — devuelve ocupaciones + concursos + apariciones en padrón histórico |

---

### SPRINT 9 — Matriz de permisos + Landing/menú/guards

**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 42h
**Objetivo:** Reemplazar listas hardcodeadas de roles por una matriz central, montar la página de inicio con la lógica del legacy (hub de accesos + buscador inteligente), menú por rol y guardas unificadas en el router.

**Contexto:** con Sprint 8 cerrado, este ciclo retoma el **gobierno del flujo concursal CPH**. Antes de construir autorizaciones (Sprint 11) hacen falta dos bases: la matriz de permisos central (Sprint 9) y las notificaciones persistidas (Sprint 10).

**Decisiones ya tomadas (no consultar de nuevo):**
- ~~Modelo de permisos: roles fijos + matriz central en `packages/types` (no tabla flexible)~~
  **⚠️ SUPERADO (2026-09-01, Agustin):** se implementó RBAC dinámico en su lugar — roles y
  permisos viven en tablas (`roles`, `permisos`, `role_permisos`), editables en caliente por
  el admin desde `/configuracion/permisos` (crear roles, tildar/destildar permisos por
  módulo/acción, sin deploy). Rol `admin` protegido (siempre acceso total, no editable ni
  borrable). `requirePermiso(modulo, accion)` reemplaza `requireRole([...])` en todos los
  endpoints que lo usaban. Ver `apps/api/src/modules/roles/`,
  `apps/api/src/shared/middleware/permisos.middleware.ts`,
  `prisma/migrations/20260901120000_rbac_dinamico/`. El resto de los ítems de Sprint 9
  (Landing, menú por rol, guards, autorizaciones, notificaciones) sigue vigente tal cual —
  esto solo reemplaza el modelo de datos de permisos, no el resto del sprint.
- Menú lateral izquierdo con items filtrados por matriz; página "Sin acceso"
- Página de inicio: puerto del `landing.html` del legacy con línea Obelisco/Tailwind. Hub de accesos en 3 columnas + buscador inteligente
- Autorizaciones: entidad genérica `Autorizacion` (tipo + referenciaId)
- Notificaciones: entidad `Notificacion` persistida + badge no leídas en el header
- Solicitud de autorización: automática al caratular el concurso CPH
- Guardas del router por rol (como en el legacy)

### Modelo de permisos — matriz (fuente de verdad en `packages/types`)

| Módulo | Acción | admin | editor | director | viewer | concursales_cph | concursales_ceetps |
|--------|--------|-------|--------|----------|--------|-----------------|--------------------|
| padron | ver | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | subir | ✅ | ✅ | — | — | — | — |
| | aprobar_padron | ✅ | ✅ | — | — | — | — |
| personas | ver | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| cargos | ver | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | crear | ✅ | ✅ | — | — | — | — |
| bajas | ver | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| | crear | ✅ | ✅ | — | — | ✅ | ✅ |
| concursos-cph | ver | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| | crear/editar | ✅ | ✅ | — | — | ✅ | — |
| | autorizar | — | — | ✅ | — | — | — |
| concursos-ceetps | ver | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| | crear/editar | ✅ | ✅ | — | — | — | ✅ |
| kpis | ver | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| configuracion | ver | ✅ | — | — | — | — | — |
| notificaciones | ver (propias) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| autorizaciones | crear (sistema) | ✅ | ✅ | — | — | ✅ | ✅ |
| | resolver (director) | — | — | ✅ | — | — | — |

> `director` pasa de "read-only" a tener acción concreta: `autorizar` en concursos-cph (Sprint 11).

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| S9-1 | Definir matriz en `packages/types`: `MODULOS`, `ACCIONES`, `MATRIZ_PERMISOS` + tipo `Permiso` | Jorge | 3h | 🔴 Crítico |
| S9-2 | Backend: middleware `requirePermiso(modulo, accion)` que consulta la matriz, reemplaza `requireRole` | Jorge | 4h | 🔴 Crítico |
| S9-3 | Frontend: helper `can(usuario, modulo, accion)` en `shared/lib/can.ts` | Agustin | 2h | 🔴 Crítico |
| S9-4 | Menú con sección "Configuración" (admin-only) + sub-item "Permisos"; ruta `/configuracion/permisos` con guard | Agustin | 3h | 🟡 Medio |
| S9-5 | `ConfiguracionPermisosPage`: renderiza la matriz en cascada (solo lectura por ahora) | Agustin | 6h | 🟡 Medio |
| S9-6 | Migración: reemplazar todos los `requireRole([...])` por `requirePermiso(...)` | Jorge | 4h | 🔴 Crítico |
| S9-7 | `InicioPage`: estructura con las 3 columnas del `landing.html` (datos mock) | Agustin | 10h | 🔴 Crítico |
| S9-8 | Filtro de tarjetas en `InicioPage` por `can(usuario, ...)`; buscador inteligente | Agustin | 4h | 🟡 Medio |
| S9-9 | Router: `ProtectedRoute` acepta `rol?: RolUsuario[]`; página "Sin acceso"; gates movidos a router | Agustin | 4h | 🔴 Crítico |
| S9-10 | AppShell: items filtrados por matriz usando `can`; sub-items controlados por permiso `crear` | Agustin | 3h | 🔴 Crítico |
| S9-11 | Migración páginas existentes: quitar gates internos (`AdminUsuariosPage`, `PadronPage`) | Agustin | 3h | 🟡 Medio |

**Criterio de éxito:**
- Endpoints de escritura usan el nuevo middleware (sin listas hardcodeadas)
- `/configuracion/permisos` renderiza la matriz para admin; oculta para el resto
- `/` muestra `InicioPage` con 3 columnas
- Menú sin items visibles para roles sin permiso
- Acceso prohibido por URL da "Sin acceso" (en router, no dentro de la página)

---

### SPRINT 10 — Notificaciones persistidas

**Duración:** 1 semana | **Capacidad:** 60h | **Estimado:** 25h
**Objetivo:** Entidad `Notificacion` persistida + badge de no leídas en el header + bandeja.

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| S10-1 | Prisma: `model Notificacion` + enum `TipoNotificacion`; migración `sprint10_notificaciones` | Jorge | 3h | 🟡 Medio |
| S10-2 | Módulo `notificaciones/`: `GET /` (paginado, propias), `PATCH /:id/leer`, `PATCH /leer-todas`; helpers de creación | Jorge | 6h | 🟡 Medio |
| S10-3 | Frontend: badge con contador de no leídas en el header | Agustin | 4h | 🟡 Medio |
| S10-4 | Bandeja `/notificaciones` (listado paginado, filtros por tipo/leídas, marcar como leídas) | Agustin | 6h | 🟡 Medio |
| S10-5 | Backend: materializar alertas de estancamiento de concursos (>30/60/90 días, anti-duplicados por `origenKey`) | Jorge | 6h | 🟢 Bajo |

**Criterio de éxito:**
- `Notificacion` se crea desde eventos del backend
- Badge de no leídas visible; la bandeja marca de a una o todas
- Alertas de estancamiento generan notificación a dueños + admin/editor

---

### SPRINT 11 — Flujo concursal CPH con autorizaciones

**Duración:** 1–2 semanas | **Capacidad:** 60–120h | **Estimado:** 38h
**Objetivo:** Caratulación → autorización del director → verificación CPH → paso Inscripción/Examen/OM.

| # | Tarea | Dev | Est. | Prioridad |
|---|-------|-----|------|-----------|
| S11-1 | Prisma: `model Autorizacion` + enum `EstadoAutorizacion`; migración `sprint11_autorizaciones` | Jorge | 4h | 🔴 Crítico |
| S11-2 | Al completar caratulación CPH: crear `Autorizacion` si no existe pendiente + notificar a `director` | Jorge | 6h | 🔴 Crítico |
| S11-3 | Módulo `autorizaciones/`: `GET /` (pendientes del director), `POST /:id/aprobar`, `POST /:id/rechazar`; al resolver notificar a `concursales_cph` | Jorge | 6h | 🔴 Crítico |
| S11-4 | Wizard CPH: badge "En espera de autorización" en fase Autorización; bloqueo de `fechaAutorizacion` hasta aprobar | Agustin | 8h | 🔴 Crítico |
| S11-5 | Portal del director: ruta `/autorizaciones` con tabla de pendientes (detalle, aprobar/rechazar) | Agustin | 6h | 🔴 Crítico |
| S11-6 | Al resolver autorización, CPH puede avanzar a `A-AUTZN`/`B-SORTEO JUR`; mapear fase Inscripción/Examen/OM | Jorge + Agustin | 4h | 🟡 Medio |
| S11-7 | Prueba end-to-end: caratular → autorización pendiente → director aprueba → notificación a CPH → CPH completa Inscripción/Examen/OM | Jorge + Agustin | 4h | 🔴 Crítico |

**Criterio de éxito:**
- Caratular genera automáticamente la `Autorizacion` y notificación al director (sin duplicados)
- El wizard muestra "En espera de autorización" y bloquea `fechaAutorizacion` hasta aprobar
- Director resuelve desde `/autorizaciones` y el siguiente paso del wizard se habilita
- Alcance: hasta Inscripción/Examen/OM; el resto del wizard queda como en Sprint 4

---

## 5. BACKLOG — Fuera de sprints actuales

| #    | Tarea                                                     | Motivo de postergación                              |
| ---- | --------------------------------------------------------- | --------------------------------------------------- |
| B-1  | Portal Postulante                                         | Sistema separado, fuera de alcance                  |
| B-2  | Integración API TAD                                       | No disponible en primera etapa                      |
| B-3  | Firma digital real                                        | No disponible en primera etapa                      |
| B-4  | Integración Hacienda                                      | No disponible en primera etapa                      |
| B-5  | Redis cache para KPIs pesados                             | No necesario en arranque                            |
| B-6  | Módulo de recorridas                                      | No urgente para MVP                                 |
| B-7  | Notificaciones por email                                  | Segunda fase                                        |
| B-8  | App mobile nativa                                         | Segunda fase                                        |
| B-9  | Multi-tab refresh token coordination (`BroadcastChannel`) | Trade-off aceptado con localStorage — no priorizado |
| B-10 | Migrar refresh token a cookie httpOnly + endpoint `/me`   | Mejora de seguridad XSS — no priorizado para MVP    |
| B-11 | ~~"Alta de Cargo" manual~~ → **promovido a S5-10**        | Promovido: necesario para cerrar el flujo concursal |
| B-12 | Identidad del cargo en padrón SIAL por clave estructural `(hospital, escalafon, codigo_repa, literal_puesto)` en vez de `id_sial` | Pendiente — fue planificado en `Concursos-CPH.md` como S8-1 pero no se implementó en Sprint 8 (ese sprint se dedicó a `validacion_vacante`). Retomar en Sprint 9+ |
| B-13 | `fechaHasta` / supresión de cargo con acto administrativo de baja | Flujo de bajas, no de altas |
| B-14 | Vincular expediente de alta con expediente de baja (contrapartida) | Requiere modelado de actos administrativos como entidad propia |

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
  → docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
  → prisma migrate deploy
  → Caddy: TLS automático (Let's Encrypt) si DOMAIN es un dominio real
```

**S6-7 (2026-08-31):** `docker-compose.prod.yml` + `apps/api/Dockerfile.prod` + `apps/web/Dockerfile.prod` +
`Caddyfile` armados y **verificados** (build real de las 3 imágenes, container de API corriendo contra la BD
real con login funcionando, nginx sirviendo el bundle con fallback de SPA funcionando, `caddy validate` en
verde) — ver `Doc/DEPLOY_PRODUCCION.md` para el detalle y qué falta completar (dominio, secrets) antes de un
deploy real.

---

## 7. REGISTRO DE DECISIONES

| Fecha      | Decisión                                                                                                                                                                                                                 | Motivo                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09    | Sin deadline fijo — calidad por etapa                                                                                                                                                                                    | Prioridad en corrección, no en velocidad                                                                                                                                                                                            |
| 2026-09    | Dotaneitor: analizar y optimizar, no reescribir                                                                                                                                                                          | Ya funciona, Python es el lenguaje correcto para esto                                                                                                                                                                               |
| 2026-09    | PostgreSQL sobre MySQL                                                                                                                                                                                                   | Particionado, full-text search, window functions                                                                                                                                                                                    |
| 2026-09    | shadcn/ui + Tailwind con tokens Obelisco                                                                                                                                                                                 | Stack moderno + identidad institucional GCBA                                                                                                                                                                                        |
| 2026-09    | Zustand para estado de auth                                                                                                                                                                                              | TanStack Query para servidor, Zustand para cliente                                                                                                                                                                                  |
| 2026-09    | Docker desde el día 1                                                                                                                                                                                                    | Entorno local = producción, deploy trivial                                                                                                                                                                                          |
| 2026-09    | UUID como PK en todas las tablas                                                                                                                                                                                         | Sin autoincremental, distribuible                                                                                                                                                                                                   |
| 2026-09    | Soft delete en todas las tablas                                                                                                                                                                                          | Histórico inmutable, nunca DELETE en producción                                                                                                                                                                                     |
| 2026-09    | Producción en servidor propio                                                                                                                                                                                            | A definir en Sprint 6                                                                                                                                                                                                               |
| 2026-08-26 | Estimados de horas en el plan son referenciales, no compromisos — cada sprint genera trabajo de verificación/corrección no planificado que es parte normal del proceso. Los estimados no se actualizan retroactivamente. | Medir velocidad contra los estimados originales daría una imagen distorsionada del trabajo real                                                                                                                                     |
| 2026-08-26 | DoD actualizado: "PR aprobado" reemplazado por "avisar antes de tocar módulo compartido"                                                                                                                                 | El equipo nunca usó PRs; la regla que sí se cumple es la coordinación previa (ver choque Sprint 3)                                                                                                                                  |
| 2026-08-26 | `PadronHistorico` necesita `cuil` desnormalizado + `@@index([cargoId])` + `unificadorPuesto` antes de construir KPIs de dotación (S6-0a/b/c)                                                                             | Sin `cuil` no se pueden contar personas únicas por período sin join; sin índice por `cargoId` el historial de un cargo hace seq scan; sin `unificadorPuesto` no se puede analizar dotación por tipo de puesto a lo largo del tiempo |
| 2026-08-31 | **S6-0 resuelto**: migración `20260831140000_padron_historico_kpis_prereq` agrega `cuil`/`unificador_puesto` (nullable) + `@@index([cargoId])` + `@@index([cuil])` a `PadronHistorico`; `aprobarSnapshotService` los completa en cada fila nueva. Backfill (`scripts/backfill-padron-historico-kpis.sql`) corrido contra datos reales: 46.889/46.889 filas, 0 nulos. | Desbloquea S6-5 (gráfico evolución dotación histórica) |
| 2026-08-31 | **S6-1 resuelto**: `GET /api/v1/kpis/dotacion` (`getKpisDotacionService`) — "vigente" = `Cargo.estado='vigente'`, "vacante" = vigente sin `Ocupacion` con `hasta IS NULL`. Devuelve `totalVigentes`, `vacantes`, `porCarrera` (por escalafón) y `porEfector` (por hospital), con filtro opcional `hospitalId`. Verificado end-to-end contra datos reales: 46.889 cargos vigentes, 0 vacantes hoy. | Alimenta S6-2 (KpisPage) |
| 2026-08-31 | **S6-3 resuelto**: `GET /api/v1/kpis/concursos` (`getKpisConcursosService`) — vista consolidada CPH+CEETPS (`totalCph`/`totalCeetps`/`total`) + `porSubEstadoCph` + `tiempoPromedioPorEtapa`. El tiempo por etapa es exclusivo de CPH: es el único tipo con escalera de sub-estados con fecha propia por nivel (CEETPS solo tiene `EstadoConcursoCeetps` plano). Se promedia `hasta - desde` por cada par consecutivo de fechas-hito con datos, excluyendo pares fuera de orden cronológico. Matemática validada con datos sintéticos en transacción con `ROLLBACK` (10 y 20 días → promedio 15, exacto); estructuralmente probado contra la BD real (0 concursos cargados localmente todavía). | Alimenta el tablero de KPIs concursales |
| 2026-08-31 | **S6-2 resuelto**: `KpisPage` (ruta `/kpis`, reemplaza el placeholder) — cards con borde amarillo (`border-primary`) para vigentes/vacantes/concursos CPH/CEETPS, skeleton `animate-pulse` mientras cargan `useKpiDotacion`/`useKpiConcursos`, dotación por carrera/efector con barra de proporción de vacantes, concursos CPH por sub-estado y tiempo promedio por etapa. Incluye filtro por hospital (instancia base de S6-4). `tsc` limpio; sin `chromium-cli`/Playwright disponibles en este entorno para captura visual — verificado por tipos + dev server sirviendo 200. | Consume S6-1/S6-3 |
| 2026-08-31 | **S6-6 resuelto**: `GET /api/v1/kpis/alertas` (`getKpisAlertasService`) — dos alertas nuevas, distintas de `AlertasSinMovimiento(Ceetps)` (S4-10/S5-9, que miden "sin movimiento hace N días"): "concursos vencidos" = CPH activo con `fechaInscHasta < hoy` y `fechaExamen` sin cargar (venció el plazo, no se programó examen); "bajas sin concurso" = `Baja.generaConcurso=false`, `estado=pendiente`, sin ningún `Concurso` enganchado (si `generaConcurso=true`, `createBajaService` ya crea el concurso atómicamente — no puede quedar huérfana). Sección "Alertas activas" agregada a `KpisPage` con borde rojo, oculta si no hay nada pendiente. Lógica validada con datos sintéticos en transacción `ROLLBACK` (1 caso de cada tipo, detectado correctamente). | Cierra la parte de Jorge del tablero |
| 2026-08-31 | **S6-5 resuelto**: no existía backend para esto (el plan solo tenía a Agustin en la fila, sin un S-x de Jorge que lo alimentara) — se agregó `GET /api/v1/kpis/dotacion-historica` (`getKpisDotacionHistoricaService`) además del frontend. Un punto por `fechaAsignada` de `PadronHistorico`, `count(DISTINCT cuil)` para personas únicas (esto es exactamente lo que S6-0 desbloqueó) + `count(*)` para cargos ocupados. Filtro por hospital vía join a `cargos` (usa el `@@index([cargoId])` de S6-0). `EvolucionDotacionChart`: línea de una sola serie a mano (sin sumar librería de charts por un solo gráfico), specs de la skill de dataviz — línea 2px, área 10%, punto final ≥8px con anillo, hairlines recesivos, crosshair+tooltip on hover, rótulo directo del último valor. Verificado contra datos reales: 45.083 personas únicas / 46.889 cargos ocupados en el único snapshot local (número tiene sentido: hay personas con más de un cargo). | Cierra la parte de Agustin del tablero |
| 2026-08-31 | **S6-8 resuelto**: smoke test completo (`scripts/smoke-test.mjs`, repetible) — health de API/Dotaneitor/web, login real, un GET representativo de los 9 módulos de rutas registrados en `app.ts` (padrón, personas, cargos, concursos-cph, concursos-ceetps, hospitales, escalafones, puestos, usuarios, bajas) + los 6 endpoints de `/kpis`, más una verificación negativa (ruta protegida sin token → 401, no 200). **21/21 OK** contra datos reales, `tsc --noEmit` limpio en `api` y `web`, `docker compose ps` con los 3 containers de dev arriba y sanos. Cierra Sprint 6 completo (S6-0 a S6-8). | Sprint 6 completo |
| 2026-08-31 | **S6-4 resuelto** (sin código adicional): el único `hospitalId` de `KpisPage` (dropdown agregado en S6-2) ya se pasa a `useKpiDotacion`, `useKpiConcursos` y `useKpiAlertas` por igual — "filtro por hospital en todo el tablero" quedó satisfecho por construcción al diseñar los 3 hooks con la misma firma `(hospitalId?: string)`. Verificado con `curl` contra los 3 endpoints. | No había necesidad de un componente de filtro global separado — un solo `useState` alcanza porque las 3 queries viven en la misma página |
| 2026-08-21 | Dotaneitor escribe directo en tablas de catálogo (`Hospital`, `Escalafon`, `CodigoRegistro`, `Especialidad`, `Puesto`); `Persona`/`Cargo`/`Ocupacion` siguen detrás del flujo de aprobación de `padron_diff`             | Evita saltear el control humano sobre datos de personas, sin duplicar catálogos de referencia (acordado Agustin/Jorge — ver `Doc/Dotaneitor_Analisis.md` sección 4.1)                                                               |
| 2026-09    | `Especialidad` y `Puesto` como catálogos de apoyo sin FK desde `Cargo` — `Cargo` mantiene campos de texto libre (`especialidad`, `literalPuesto`, `agrupador`, `unificadorPuesto`)                                       | Cambiar a FK implicaba migración de datos y mayor alcance en Sprint 2; catálogos paralelos permiten normalización progresiva sin romper el modelo existente                                                                         |
| 2026-09    | `createConcursoTx(tx, body, usuarioId, bajaId?)` como función pública en `concursos.service.ts` — acepta `tx` externo para poder llamarla desde `createBajaService` sin anidar `$transaction`                            | Permite que la transacción de baja (crear baja → marcar cargo no_vigente → crear concurso) sea atómica sin duplicar lógica ni anidar transacciones Prisma                                                                          |
| 2026-09    | `idSial` sintético `MANUAL-{codigo}` para cargos creados manualmente vía `POST /api/v1/cargos`                                                                                                                           | `idSial` es un identificador del sistema SIAL del GCBA que solo existe para cargos del padrón; los cargos manuales necesitan un valor único que no colisione con los reales                                                        |
| 2026-09    | Contratos (`Doc/Contrato_*.md`) actualizados a estado real Post-Sprint 5 — estado cambiado de BORRADOR a VIGENTE                                                                                                          | Los contratos estaban desactualizados desde Sprint 2; ahora reflejan el schema real, los endpoints implementados, la estructura de carpetas real y la decisión Bootstrap→Tailwind resuelta                                         |
| 2026-09    | El alta con contrapartida de baja **no es un origen de cargo**                                                                                                                                                          | El cargo estructural y su historia persisten; solo se reemplaza la persona que lo ocupa. Es un movimiento de ocupación (flujo de bajas), no un alta                                                                                |
| 2026-09    | RF-11/RF-12 (persistir `expediente`/`fechaDesde` en `cargos`) como P1 en Sprint 7                                                                                                                                       | El acto administrativo que respalda un alta no puede vivir solo en memoria del navegador — es un dato de auditoría obligatorio                                                                                                     |
| 2026-09    | Cargos manuales preexistentes quedan con `expediente`/`fechaDesde` NULL (S7-3)                                                                                                                                          | El dato nunca se persistió; no hay forma de recuperarlo retroactivamente. Se documenta en lugar de inventar valores                                                                                                                |
| 2026-09    | Duplicado estructural en alta manual = advertencia (`409` + override), no bloqueo duro (S7-5/S7-7)                                                                                                                      | Puede haber casos legítimos de cargos gemelos (misma estructura, distinto financiamiento). El usuario decide                                                                                                                       |

| 2026-08-10 | Escalafón General en POF/POU muestra opción única "Anexo 2" | En POF/POU el EG solo tiene puestos del Anexo 2 (11 puestos, `modalidad='ambos'`). Las opciones General/Jefe/Director/Gerencial son exclusivas de Estructura |
| 2026-08-10 | Página de inicio al login cambiada a `/kpis` | El tablero KPIs es la vista principal operativa; Padrón y Bajas Consolidadas son vistas de administrador |
| 2026-08-10 | Padrón Semanal y Bajas Consolidadas movidos a sección admin del menú (debajo del segundo divisor) | Son funciones de administración del sistema, no de operación diaria |
| 2026-08-10 | Tablas `bajas` y `concursos` limpiadas (0 registros) | Todos los registros eran de prueba; el sistema queda listo para datos reales |

| Métrica                                | Objetivo                          |
| -------------------------------------- | --------------------------------- |
| Tiempo de procesamiento padrón semanal | < 60 segundos para 48k registros  |
| Tiempo de carga del tablero            | < 3 segundos                      |
| Búsqueda de personas                   | < 500ms con full-text search      |
| Errores en producción post-deploy      | 0 críticos                        |
| Cobertura de flujo concursal CPH       | 100% de sub-estados implementados |
| Cobertura de flujo concursal CEETPS    | 100% de estados implementados     |
