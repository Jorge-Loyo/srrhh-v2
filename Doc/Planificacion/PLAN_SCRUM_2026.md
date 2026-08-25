# PLAN SCRUM â€” SRRHH v2

# Sistema de Recursos Humanos â€” Gobierno de la Ciudad de Buenos Aires

> Documento de planificaciÃ³n Ã¡gil. Fuente de verdad para sprints, tareas y decisiones de alcance.
> Ãšltima actualizaciÃ³n: 2026-09 (Sprint 2 Jorge completado y revisado)
>
> ðŸ“‹ **GestiÃ³n de tareas:** [Notion â€” SRRHH v2](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)

---

## ESTADO ACTUAL

| Sprint                              | Estado        | Completado    |
| ----------------------------------- | ------------- | ------------- |
| Sprint 0 â€” Infraestructura          | âœ… Completado | S0-1 a S0-11  |
| Sprint 1 â€” AutenticaciÃ³n            | âœ… Completado | S1-1 a S1-10  |
| Sprint 2 â€” Dotaneitor + PadrÃ³n      | âœ… Completo â€” verificado end-to-end con datos reales 2026-08-25 | S2-1 a S2-19 (âœ…) |
| Sprint 3 â€” Personas y Cargos        | âœ… Completo â€” verificado con browser real 2026-08-25 | S3-1 a S3-11 (âœ…) |
| Sprint 4 â€” Concursos CPH            | â³ Pendiente  | â€”             |
| Sprint 5 â€” Concursos CEETPS + Bajas | â³ Pendiente  | â€”             |
| Sprint 6 â€” KPIs + Deploy            | â³ Pendiente  | â€”             |

---

## 1. CONTEXTO DEL EQUIPO

| ParÃ¡metro          | Valor                                                |
| ------------------ | ---------------------------------------------------- |
| Equipo             | Jorge (Dev 1 â€” Backend) + Agustin (Dev 2 â€” Frontend) |
| Capacidad          | 30h/semana por dev = 60h/semana totales              |
| DuraciÃ³n de sprint | 1â€“2 semanas segÃºn complejidad                        |
| Ceremonia          | Review + Retro semanal                               |
| Herramienta        | Notion                                               |
| Sin daily          | ComunicaciÃ³n asÃ­ncrona                               |
| Deadline MVP       | Sin fecha fija â€” prioridad: calidad por etapa        |

### DefiniciÃ³n de Done (DoD)

Un Ã­tem estÃ¡ terminado cuando:

- [ ] Funcionalidad implementada y probada manualmente
- [ ] Sin regresiones en mÃ³dulos existentes
- [ ] DocumentaciÃ³n actualizada (este doc + archivos Doc/)
- [ ] CÃ³digo en rama `develop` con PR aprobado

---

## 2. ARQUITECTURA DEL SISTEMA

```
SRRHH-Legacy/ (monorepo pnpm + Turborepo)
â”œâ”€â”€ apps/api/          â† Fastify + Prisma + PostgreSQL
â”œâ”€â”€ apps/web/          â† React + Vite + Tailwind (tokens Obelisco GCBA)
â”œâ”€â”€ packages/types/    â† DTOs y enums compartidos
â”œâ”€â”€ packages/utils/    â† Helpers compartidos
â”œâ”€â”€ prisma/            â† Schema + migraciones (fuente de verdad BD)
â”œâ”€â”€ services/
â”‚   â””â”€â”€ dotaneitor/    â† Microservicio Python (anÃ¡lisis Sprint 0)
â””â”€â”€ docker-compose.yml â† PostgreSQL + API + Web + Dotaneitor
```

### Stack definitivo

| Capa                 | TecnologÃ­a                           |
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
| Microservicio padrÃ³n | Python + FastAPI (Dotaneitor)        |
| Monorepo             | pnpm workspaces + Turborepo          |
| Contenedores         | Docker + docker-compose              |

---

## 3. ALCANCE MVP

### Dentro del alcance

- Infraestructura base: Docker, PostgreSQL, API, Web
- Dotaneitor integrado: procesamiento semanal del padrÃ³n Excel
- PadrÃ³n semanal: carga, diff, validaciÃ³n y aprobaciÃ³n
- Personas y cargos: visualizaciÃ³n y bÃºsqueda
- Seguimiento concursos CPH (Ley 6.035)
- Seguimiento concursos CEETPS â€” ENF, TEC, EG
- Bajas consolidadas conectadas al flujo concursal
- Tablero de KPIs de dotaciÃ³n y concursales
- AutenticaciÃ³n con roles

### Fuera del alcance (primera etapa)

- Portal Postulante
- IntegraciÃ³n API TAD (manual)
- Firma digital
- IntegraciÃ³n Hacienda (manual)
- IntegraciÃ³n con otros sistemas GCBA

### Actores del sistema

| Actor               | Rol                                                | Ejemplos                 |
| ------------------- | -------------------------------------------------- | ------------------------ |
| admin               | ConfiguraciÃ³n, usuarios, carga masiva              | Agus, Jorge              |
| editor              | Lectura + escritura en todos los mÃ³dulos           | Lucas y equipo           |
| director y usuarios | Solo lectura de su de nicho                        | Autoridades Superiores   |
| concursales_cph     | Lectura total + escritura concursos CPH y bajas    | Alexis, Rijana e eequipo |
| concursales_ceetps  | Lectura total + escritura concursos CEETPS y bajas | Alexi, Laura e Equipo    |

---

## 4. SPRINTS

---

### SPRINT 0 â€” Infraestructura base + anÃ¡lisis Dotaneitor

**DuraciÃ³n:** 1 semana | **Capacidad:** 60h
**Objetivo:** Entorno de desarrollo 100% funcional y Dotaneitor documentado.

| #     | Tarea                                                                  | Dev     | Est. | Prioridad  |     |
| ----- | ---------------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S0-1  | Levantar PostgreSQL con Docker (WSL), verificar conexiÃ³n               | Jorge   | 2h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-2  | Ejecutar `prisma migrate dev` â€” primera migraciÃ³n                      | Jorge   | 2h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-3  | Verificar que API arranca y responde `/health`                         | Jorge   | 1h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-4  | Verificar que Web arranca y muestra LoginPage                          | Agustin | 1h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-5  | Leer y documentar cÃ³digo Dotaneitor: endpoints, lÃ³gica, inputs/outputs | Agustin | 8h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-6  | Mapear columnas del Excel de padrÃ³n â†’ campos del schema Prisma         | Agustin | 4h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-7  | Identificar deuda tÃ©cnica y optimizaciones del Dotaneitor              | Agustin | 4h   | ðŸŸ¡ Medio   | âœ…  |
| S0-8  | Crear `services/dotaneitor/` con Dockerfile y README                   | Jorge   | 4h   | ðŸ”´ CrÃ­tico | âœ…  |
| S0-9  | Seed de datos de prueba: hospitales, escalafones, usuario admin        | Jorge   | 4h   | ðŸŸ¡ Medio   | âœ…  |
| S0-10 | Documentar hallazgos Dotaneitor en `Doc/Dotaneitor_Analisis.md`        | Agustin | 3h   | ðŸŸ¡ Medio   | âœ…  |
| S0-11 | Configurar GitHub Actions: lint + build en PR                          | Jorge   | 3h   | ðŸŸ¢ Bajo    | âœ…  |

**Criterio de Ã©xito:**

- `docker-compose up` levanta PostgreSQL, API y Web sin errores
- `GET /health` responde `{ status: 'ok' }`
- LoginPage visible en `http://localhost:5173`
- Dotaneitor documentado: sabemos exactamente quÃ© hace, quÃ© recibe y quÃ© devuelve
- Documento `Doc/Dotaneitor_Analisis.md` completo

---

### SPRINT 1 â€” AutenticaciÃ³n + usuarios + seed real

**DuraciÃ³n:** 1 semana | **Capacidad:** 60h
**Objetivo:** Login funcional con roles, usuarios reales en BD.
**Estado:** âœ… Completado

> **Nota:** S1-8 (seed hospitales/escalafones/admin) fue adelantado y completado en Sprint 0 como S0-9.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |     |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S1-1  | Completar `auth.service.ts`: login con bcrypt + JWT           | Jorge   | 4h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-2  | Refresh token: rotaciÃ³n + detecciÃ³n de reutilizaciÃ³n          | Jorge   | 6h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-3  | Endpoint `POST /api/v1/auth/logout` â€” revocar token           | Jorge   | 2h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-4  | Middleware `authenticate` + `requireRole` integrados en rutas | Jorge   | 3h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-5  | CRUD usuarios: listar, crear, activar/desactivar (solo admin) | Agustin | 6h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-6  | LoginPage: conectar con API real, manejo de errores           | Agustin | 3h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-7  | ProtectedRoute: redirigir a /login si no autenticado          | Agustin | 2h   | ðŸ”´ CrÃ­tico | âœ…  |
| S1-8  | Seed: hospitales reales + escalafones + usuario admin inicial | Jorge   | 4h   | ðŸŸ¡ Medio   | âœ…  |
| S1-9  | PÃ¡gina Admin/Usuarios: tabla + formulario crear usuario       | Agustin | 6h   | ðŸŸ¡ Medio   | âœ…  |
| S1-10 | Audit log: middleware registra toda escritura automÃ¡ticamente | Jorge   | 3h   | ðŸŸ¡ Medio   | âœ…  |

**Criterio de Ã©xito:**

- Login con usuario/contraseÃ±a real funciona end-to-end
- Refresh token rota correctamente
- Admin puede crear usuarios con roles
- Toda escritura queda en `audit_logs`

**Hallazgos de revisiÃ³n (Agustin, 2026-08-24 â€” revisiÃ³n completa de Sprint 1 ya cerrado):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`audit_log` nunca escribÃ­a nada.** `app.ts` registraba `auditLog` como hook `preHandler` a nivel raÃ­z, y Fastify corre los hooks de raÃ­z *antes* que los `preHandler` de cada plugin de rutas (donde vive `authenticate`, quien reciÃ©n ahÃ­ popula `request.user`). Resultado: `request.user` siempre era `undefined` cuando `auditLog` corrÃ­a, asÃ­ que el `if (!user) return` cortaba en el 100% de las requests desde que se implementÃ³ â€” pese a estar marcada âœ…. Verificado empÃ­ricamente con logs en el servidor real. | ðŸ”´ Alta | âœ… **Corregido** â€” `auditLog` pasÃ³ de `preHandler` a `onResponse` en `app.ts` (para ese punto del ciclo de vida todos los `preHandler`, incluidos los de plugins anidados, ya terminaron). Re-verificado: `request.user` llega poblado. |
| 2 | **Race condition teÃ³rica en la rotaciÃ³n de refresh token** (`auth.service.ts:refreshTokenService`). Lee el token, chequea `revocado`, y reciÃ©n despuÃ©s lo marca revocado â€” son pasos separados, no atÃ³micos. Si el mismo refresh token llega dos veces casi simultÃ¡neo (dos tabs, bug de cliente), ambas requests podrÃ­an pasar el chequeo antes de que ninguna confirme la revocaciÃ³n, rotando el mismo token dos veces y debilitando la garantÃ­a de "un solo uso". | ðŸŸ¡ Media | âœ… **Corregido** â€” `updateMany WHERE revocado = false` atÃ³mico: solo la primera request actualiza la fila; la segunda no encuentra nada que actualizar y cae en el bloque de revocaciÃ³n de familia. |
| 3 | **Timing side-channel menor en el login** (`auth.service.ts:loginService`). Si el usuario no existe, la funciÃ³n devuelve rÃ¡pido (sin `bcrypt.compare`); si existe pero la contraseÃ±a es incorrecta, corre bcrypt (~100ms). En teorÃ­a permite distinguir usuarios vÃ¡lidos por el tiempo de respuesta. | ðŸŸ¢ Baja | âœ… **Corregido** â€” siempre se corre `bcrypt.compare` contra un hash dummy cuando el usuario no existe, igualando el tiempo de respuesta. |
| 4 | **Multi-tab**: el `refreshToken` vive en `localStorage` (compartido entre pestaÃ±as del mismo origen), pero cada pestaÃ±a tiene su propio estado de mÃ³dulo en memoria (`useAuth`/`api-client`, sin coordinaciÃ³n entre pestaÃ±as). Si dos pestaÃ±as refrescan casi al mismo tiempo, podrÃ­a dispararse la detecciÃ³n de reutilizaciÃ³n de tokens y cerrar sesiÃ³n en ambas. | ðŸŸ¢ Baja | â³ **LimitaciÃ³n conocida**, trade-off ya aceptado junto con la decisiÃ³n de usar `localStorage` en vez de cookie httpOnly (ver nota de S1-6/S1-7 mÃ¡s arriba en el historial de trabajo). Se resolverÃ­a con `BroadcastChannel` o eventos de `storage` para coordinar pestaÃ±as â€” no priorizado por ahora. Agregado al backlog como B-9. |

---

### SPRINT 2 â€” Dotaneitor optimizado + integraciÃ³n padrÃ³n

**DuraciÃ³n:** 2 semanas | **Capacidad:** 120h
**Objetivo:** Dotaneitor optimizado y conectado al flujo de padrÃ³n de SRRHH v2.

> **Ver `Doc/Dotaneitor_Analisis.md`** (secciones 6 y 7 para el mapeo de columnas y la deuda
> tÃ©cnica de Sprint 0; secciÃ³n 4.1 para los pasos 14-17 y secciÃ³n 6.4 para la propuesta de campos
> nuevos en Persona/Cargo/Ocupacion, agregados el 2026-08-21 â€” nuevos requisitos de Agustin, ya
> acordados con Jorge en lo arquitectÃ³nico, que dan origen a S2-13 a S2-17 abajo).

| #     | Tarea                                                                     | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------------------- | ------- | ---- | ---------- |
| S2-1  | Aplicar optimizaciones identificadas en Sprint 0 al Dotaneitor            | Agustin | 12h  | ðŸ”´ CrÃ­tico | âœ… 8/9 â€” queda solo #5 (staleness de `MAPEO_ESPECIALIDAD_POR_PUESTO`), informativo, sin acciÃ³n pendiente |
| S2-2  | Endpoint `POST /api/v1/padron/upload`: recibe Excel, crea snapshot        | Jorge   | 6h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-3  | IntegraciÃ³n Node â†’ Python: enviar archivo, recibir diff                   | Jorge   | 8h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-4  | Guardar `padron_diff` en BD con resultado del Dotaneitor                  | Jorge   | 4h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-5  | Endpoint `GET /api/v1/padron/snapshots/:id/diff` paginado                 | Jorge   | 4h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-6  | Endpoint `POST /api/v1/padron/snapshots/:id/aprobar`                      | Jorge   | 8h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-7  | LÃ³gica de aprobaciÃ³n: actualizar ocupaciones, personas, cargos, historico | Jorge   | 10h  | ðŸ”´ CrÃ­tico | âœ… |
| S2-8  | Endpoint `POST /api/v1/padron/snapshots/:id/rechazar`                     | Jorge   | 2h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-9  | PadronPage: subir archivo + ver estado del job                            | Agustin | 8h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-10 | PadronDiffPage: tabs Nuevos / Modificados / Eliminados                    | Agustin | 10h  | ðŸ”´ CrÃ­tico | âœ… (ruta directa por URL â€” entrada vÃ­a lista llega con S2-9) |
| S2-11 | Badge en header cuando hay snapshot pendiente                             | Agustin | 2h   | ðŸŸ¡ Medio   | âœ… |
| S2-12 | Bloqueo: no se puede subir nuevo archivo con snapshot pendiente           | Jorge   | 2h   | ðŸ”´ CrÃ­tico | âœ… |
| S2-13 | Schema: 7 tablas `ref_*` nuevas â€” `ref_abreviaturas_tecnicas`, `ref_abreviaturas_titulo`, `ref_correcciones_lit_puesto`, `ref_correcciones_especialidad`, `ref_especialidad_por_puesto`, `ref_conectores_minuscula`, `ref_sufijos_ordinales` | Jorge | â€” | ðŸ”´ CrÃ­tico | âœ… |
| S2-14 | Schema: catÃ¡logos `Especialidad` y `Puesto` como tablas de apoyo (sin FK desde `Cargo` â€” texto libre se mantiene); Dotaneitor escribe directo en catÃ¡logos de bajo riesgo | Jorge | â€” | ðŸ”´ CrÃ­tico | âœ… |
| S2-15 | Campo `Especialidad.prioritaria Boolean @default(false)` | Jorge | â€” | ðŸŸ¡ Medio | âœ… |
| S2-16 | Campos `archivoResultadoPath` y `archivoCalidadPath` en `PadronSnapshot` | Jorge | â€” | ðŸŸ¡ Medio | âœ… |
| S2-17 | Schema: 7 campos nuevos en `Persona` (contacto/domicilio/antigÃ¼edad), 7 en `Cargo` (reparticiÃ³n/clasificaciones SIAL), 19 en `Ocupacion` (jefatura/comisiÃ³n/bloqueo/documentaciÃ³n/`diasGuardia String[]`) | Jorge | â€” | ðŸŸ¡ Medio | âœ… |
| S2-18 | Upload async: `POST /upload` dispara pipeline en background y devuelve inmediato con `snapshotId`. `EstadoSnapshot` con `procesando`/`error`. Campo `pasoActual` para progreso granular. `GET /snapshots/:id/estado` para polling. Cleanup al arrancar. | Jorge | 4h | ðŸ”´ CrÃ­tico | âœ… |
| S2-19 | Dotaneitor migrado de MySQL a Postgres (SQLAlchemy). DecisiÃ³n arquitectural: diff calculado por Node (OpciÃ³n B). `/diff`, `/guardar-bd`, `/historial` eliminados. `calcularDiff()` en Node pagina `/preview` y compara contra Cargo+Ocupacion en Postgres. | Jorge | 8h | ðŸ”´ CrÃ­tico | âœ… |

> S2-2 a S2-8 y S2-12 a S2-17 completados por Jorge (commit `0c9d49e`). S2-10 y S2-11 completados y
> verificados por Agustin (2026-08-24). S2-19 completado por Jorge (commit `8031bbf`): Dotaneitor
> migrado a Postgres, diff calculado por Node. S2-18 completado por Jorge (commit `b30cfa0`): upload
> async, estados `procesando`/`error`, `pasoActual`, endpoint de polling, cleanup al arrancar.
> S2-9 completado y verificado por Agustin (2026-08-24): `PadronPage` (formulario de subida
> admin/editor, barra de progreso con polling a `/estado` traduciendo `pasoActual` a texto amigable,
> manejo de `estado: error` con `errorMsg`, historial de snapshots), reemplaza el `Placeholder` en
> `router.tsx`. De paso se agregaron los botones Aprobar/Rechazar a `PadronDiffPage` (llaman a
> `POST /snapshots/:id/aprobar` y `/rechazar`, solo visibles para admin/editor y solo con snapshot
> `pendiente`) â€” sin esto el criterio de Ã©xito "subir â†’ ver diff â†’ aprobar â†’ datos en BD" no era
> alcanzable desde la UI aunque cada tarea individual estuviera âœ…. Verificado con Chrome headless vÃ­a
> CDP (red mockeada): flujo feliz completo (subida â†’ progreso â†’ pendiente â†’ link a diff â†’ aprobar â†’
> vuelta al listado), escenario de error (corta el polling, muestra `errorMsg`), rol viewer (sin
> formulario de subida ni botones de decisiÃ³n), rechazar. Sin errores de consola en ningÃºn caso.
> `tsc --noEmit` limpio en `apps/web` y `apps/api`.

### âœ… Sprint 2 cerrado â€” y verificado corriendo de verdad (2026-08-25)

Todas las tareas completas (S2-1 a S2-19). S2-1 quedÃ³ en 8/9 hallazgos resueltos â€” el restante
(staleness de `MAPEO_ESPECIALIDAD_POR_PUESTO`) es informativo, sin acciÃ³n pendiente.

El 2026-08-25 se corriÃ³ el flujo completo contra Docker + Postgres real + un padrÃ³n real
(47.203 filas), tal como pedÃ­a la advertencia del hallazgo #1 de la revisiÃ³n de Agustin mÃ¡s abajo.
Aparecieron 4 bugs adicionales que solo se manifestaban en runtime (uno en el upload, uno en
Dotaneitor, dos en la aprobaciÃ³n â€” uno de ellos silencioso, sin excepciÃ³n, `aprobar` devolvÃ­a
200 OK sin haber creado ninguna persona ni ocupaciÃ³n) â€” los cuatro corregidos y el flujo completo
(upload â†’ diff â†’ aprobar) confirmado funcionando de punta a punta con conteos reales verificados
en la BD (45.083 personas, 46.889 cargos/ocupaciones/histÃ³rico). Detalle completo en la tabla
"VerificaciÃ³n end-to-end real" al final de esta secciÃ³n.

**Criterio de Ã©xito:**

- Flujo completo: subir Excel â†’ ver diff â†’ aprobar â†’ datos en BD â€” âœ…
- Dotaneitor optimizado y documentado â€” âœ…
- `padron_historico` se popula correctamente al aprobar â€” âœ… (S2-7, Jorge)
- Bloqueo de doble carga funciona â€” âœ… (S2-12, Jorge)
- Sin datos hardcodeados en Dotaneitor: abreviaturas, correcciones y mapeos viven en tablas `ref_*` â€” âœ… (S2-13, Jorge)
- Cada corrida de padrÃ³n queda archivada (Excel resultado + reporte de calidad) y es descargable despuÃ©s â€” âœ… (S2-16, Jorge)

**Hallazgos de revisiÃ³n (Jorge, Sprint 2 â€” revisiÃ³n completa post-implementaciÃ³n):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`refreshTokenService`: ventana de inconsistencia** â€” `updateMany` atÃ³mico + `findUnique` separados: si el `findUnique` fallaba despuÃ©s del `updateMany`, el token quedaba revocado pero el usuario recibÃ­a 401 sin poder continuar. | ðŸŸ¡ Media | âœ… **Corregido** â€” ambas operaciones envueltas en `$transaction` atÃ³mica. |
| 2 | **`padronRoutes` sin `requireRole`** â€” cualquier usuario autenticado (incluso `viewer`/`director`) podÃ­a subir, aprobar o rechazar un padrÃ³n. | ðŸŸ¡ Media | âœ… **Corregido** â€” `requireRole([ADMIN, EDITOR])` agregado como `preHandler` en `POST /upload`, `POST /aprobar`, `POST /rechazar`. |
| 3 | **`throw { statusCode: 400 }` objeto literal** en `padron.routes.ts` â€” el `errorHandler` no lo reconocÃ­a y devolvÃ­a 500 en vez de 400. | ðŸŸ¡ Media | âœ… **Corregido** â€” reemplazado por `AppError.badRequest('Archivo requerido')`. |
| 4 | **`auditLog`: `entidadId` incorrecto para rutas anidadas** â€” `parts[4]` devolvÃ­a `'snapshots'` en vez del UUID para `/api/v1/padron/snapshots/:id/aprobar`. | ðŸŸ¢ Baja | âœ… **Corregido** â€” regex UUID para encontrar el ID en cualquier posiciÃ³n de la URL. |
| 5 | **N queries de catÃ¡logo en `aprobarSnapshotService`** â€” `findUnique` de hospital/escalafÃ³n por cada registro nuevo, sin cachÃ©. | ðŸŸ¢ Baja | âœ… **Corregido** â€” `hospitalCache` y `escalafonCache` (`Map`) antes del loop. |
| 6 | **`idSialRol.split('-')[0]`** â€” frÃ¡gil si el formato cambia o si `idSial` contiene guiones. | ðŸŸ¢ Baja | âœ… **Corregido** â€” `cargoId` obtenido desde `tx.ocupacion.findUnique({ where: { idSialRol } })` (FK directa). |
| 7 | **`refreshExpiresAt` no soporta `'s'`** â€” regex `[dhm]` no incluÃ­a segundos, rompÃ­a tests de integraciÃ³n con expiraciÃ³n rÃ¡pida. | ðŸŸ¢ Baja | âœ… **Corregido** â€” regex extendida a `[dhms]`. |

**Hallazgos de revisiÃ³n (Agustin, sobre S2-18/S2-19 de Jorge â€” 2026-08-24):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`services/dotaneitor/main.py` tenÃ­a DOS `app = FastAPI(...)` de nivel de mÃ³dulo** (lÃ­nea 59 la nueva, lÃ­nea 618 la vieja) â€” el commit de S2-19 agregÃ³ el cÃ³digo migrado a Postgres pero nunca borrÃ³ el archivo original de antes de la migraciÃ³n, solo lo dejÃ³ pegado despuÃ©s. En Python, la segunda asignaciÃ³n de `app` pisa a la primera: **`uvicorn main:app` corrÃ­a el objeto viejo**, con las 11 rutas viejas basadas en `mysql.connector` (que ni siquiera tiene variables de conexiÃ³n configuradas en `docker-compose.yml`) â€” y `/diff`, `/guardar-bd`, `/historial`, `/ultima-actualizacion`, que se suponÃ­a habÃ­an sido eliminados, seguÃ­an activos. Todo el trabajo de S2-19 (`DotacionAutomationBD` con SQLAlchemy/Postgres, las rutas nuevas) quedaba registrado en un `app` huÃ©rfano, nunca sirviÃ©ndose. No se detecta revisando el diff lÃ­nea por lÃ­nea (la lÃ³gica nueva era correcta en sÃ­ misma) â€” solo corriendo el archivo real o buscando duplicados de nivel de mÃ³dulo. | ðŸ”´ **Alta** â€” invalidaba S2-19 en runtime pese a verse correcto en el cÃ³digo | âœ… **Corregido** â€” se borrÃ³ la secciÃ³n vieja completa (antes lÃ­nea 557 en adelante, ~1000 lÃ­neas: `import mysql.connector`, el segundo `app = FastAPI`, `/diff`, `/guardar-bd`, `/historial`, `/ultima-actualizacion`, `COL_MAP`). El archivo quedÃ³ en 556 lÃ­neas, un solo `app`, 11 rutas, 0 referencias a `mysql`. Verificado con `ast.parse` + `py_compile`. |
| 2 | **`runPipeline()` sobreescribe `totalRegistros`** con el conteo del diff (`totalNuevos + totalEliminados + totalModificados`) al terminar con Ã©xito, en vez de dejar el valor original (filas del Excel subido, fijado una sola vez al crear el snapshot). `PadronDiffPage.tsx` muestra ese campo como "X registros procesados" asumiendo que es el conteo del archivo â€” con el bug, muestra el conteo del diff en su lugar, un dato distinto. | ðŸŸ¢ Baja | âœ… **Corregido** â€” se sacÃ³ la sobreescritura de `totalRegistros` de la transacciÃ³n final de `runPipeline()` en `padron.service.ts`. |

Revisado tambiÃ©n en detalle sin encontrar problemas: la construcciÃ³n de `idSialRol` en `calcularDiff()` (usa `cuilYRol` completo en vez de solo el nÃºmero de rol â€” distinto a lo documentado en `Dotaneitor_Analisis.md` Â§6.3, pero internamente consistente entre creaciÃ³n y lectura, no rompe nada), y el manejo de errores/estados de `runPipeline()` (marca `error` correctamente ante cualquier falla del pipeline).

âš ï¸ **Importante para Jorge:** el hallazgo #1 significa que hasta este fix, S2-19 nunca corriÃ³ de verdad en ningÃºn entorno donde se haya levantado el servidor â€” vale la pena que lo confirme corriendo `docker-compose up` y probando el flujo completo una vez que traiga este cambio.

**RevisiÃ³n completa de Sprint 2 â€” Agustin, 2026-08-24 (tareas propias y de Jorge):**

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`aprobarSnapshotService` sin timeout de transacciÃ³n, con hasta 6 queries secuenciales por fila** (cÃ³digo de Jorge, S2-6/S2-7). `prisma.$transaction(...)` sin `{ timeout }` usa el default de Prisma â€” confirmado en `@prisma/client@5.22.0/runtime/library.d.ts`: `maxWait ?= 2000, timeout ?= 5000`. El loop original hacÃ­a entre 4 y 6 round-trips secuenciales a Postgres por cada `idSialRol` cambiado (hospital, escalafÃ³n, persona, cargo, ocupaciÃ³n + 2 mÃ¡s para histÃ³rico). Con eso, cualquier diff no trivial excede los 5s y hace rollback total (`P2028`). Grave en particular porque **la primera aprobaciÃ³n contra un Postgres reciÃ©n migrado dispara esto siempre**: `calcularDiff()` compara contra `Cargo` (vacÃ­o al inicio) y marca *todo* el padrÃ³n como "nuevo" â€” hasta ~48k filas (volumen ya establecido en Sprint 0). RompÃ­a el criterio de Ã©xito central del sprint en el primer uso real. El `errorHandler` tampoco reconoce `PrismaClientKnownRequestError`, asÃ­ que el fallo llegaba al frontend como 500 genÃ©rico sugiriendo "reintentar", cuando reintentar da el mismo resultado siempre. | ðŸ”´ **CrÃ­tica** | âœ… **Corregido** â€” reescrita para precargar en bloque (una query total, no una por fila) todo lo que antes se buscaba fila por fila, crear en bloque con `createMany` (troceado en lotes de 2000 para no pasarse del lÃ­mite de parÃ¡metros de Postgres) en vez de un `create` por fila, batchear `eliminados` en un solo `updateMany` con `idSialRol: { in: [...] }`, y batchear el histÃ³rico con un `createMany` final en vez de un `create` por fila. "modificado" queda por fila (cada una cambia campos distintos, no se puede expresar como un Ãºnico `updateMany`) pero sin el `find` extra que tenÃ­a antes. Se agregÃ³ ademÃ¡s `{ timeout: 10min, maxWait: 10s }` como margen de seguridad. El mismo troceado se aplicÃ³ al `padronDiff.createMany` de `runPipeline()` (mismo riesgo de lÃ­mite de parÃ¡metros con un diff de ~48k filas). Verificado con un harness en memoria (mock de `tx`, sin Postgres real disponible) cubriendo: dedup de hospital/escalafÃ³n/persona nuevos referenciados por mÃºltiples filas del mismo lote, una persona con dos altas simultÃ¡neas, eliminado y modificado sobre datos preexistentes, e histÃ³rico con una fila por cada `idSialRol` tocado â€” 17/17 aserciones OK. |
| 2 | **S2-14 marcada âœ… pero la mitad del comportamiento descripto no existe.** La tarea dice "Dotaneitor escribe directo en catÃ¡logos de bajo riesgo" (tablas `Especialidad`/`Puesto`) â€” el schema estÃ¡ (S2-13/14), pero no hay ningÃºn cÃ³digo, ni en `services/dotaneitor/*.py` ni en la API (`prisma.especialidad`/`prisma.puesto`), que escriba en esas tablas. Tampoco hay seed. Quedaron como catÃ¡logos fantasma: creados pero nunca poblados por nadie, y `Especialidad.prioritaria` (S2-15) queda inerte por la misma razÃ³n. | ðŸŸ¡ Media | ðŸ“‹ **Documentado, sin acciÃ³n por ahora** â€” nada mÃ¡s depende todavÃ­a de que estas tablas tengan datos, se retoma cuando alguna tarea futura las necesite de verdad. Si Jorge tiene contexto de por quÃ© quedÃ³ asÃ­ (Â¿decisiÃ³n consciente de postergarlo?), vale la pena que lo sume acÃ¡. |
| 3 | **`prisma generate` nunca se habÃ­a vuelto a correr despuÃ©s de la Ãºltima reinstalaciÃ³n de `node_modules`** de esta sesiÃ³n (mencionada en el historial de Sprint 1/2 al arreglar los symlinks rotos de `@turbo`/`@esbuild`) â€” pnpm resuelve `@prisma/client` a un stub sin generar (`PrismaClient: any`, literalmente el placeholder que trae el paquete antes de generar) en vez del cliente real. Efecto doble: (a) en runtime, la API **no podÃ­a arrancar** (`Error: @prisma/client did not initialize yet`) â€” verificado ejecutando el server real, no es teÃ³rico; (b) en compile-time, cualquier cÃ³digo que dependa de inferencia de tipos de Prisma en un contexto de destructuring (`Promise.all`) caÃ­a a `{}` en vez de tirar error real, asÃ­ que `tsc --noEmit` venÃ­a dando falsos positivos de "limpio" en cÃ³digo que en verdad no tenÃ­a type-safety sobre Prisma. No es un bug de cÃ³digo de nadie â€” es un paso de setup que faltaba automatizar. | ðŸ”´ Alta (bloqueaba arrancar la API) | âœ… **Corregido** â€” se corriÃ³ `prisma generate` (quedÃ³ bien generado esta vez) y se agregÃ³ `"postinstall": "prisma generate --schema=./prisma/schema.prisma"` al `package.json` raÃ­z para que no vuelva a pasar despuÃ©s de un `pnpm install` limpio. Con el cliente real generado, `tsc --noEmit` volviÃ³ a correr (ahora sÃ­) contra los tipos reales y encontrÃ³ 2 errores genuinos en el fix del hallazgo #1 (`.filter(Boolean)` no angosta `string | undefined` a `string` en TS) â€” ya corregidos. El resto de la API (`auth.service.ts`, `usuarios.service.ts`, etc.) sigue limpio bajo los tipos reales. |

**VerificaciÃ³n end-to-end real (Jorge + Claude, 2026-08-25) â€” respondiendo a la advertencia del hallazgo #1 de Agustin de arriba ("vale la pena que lo confirme corriendo `docker-compose up` y probando el flujo completo"):**

Se corriÃ³ el stack completo en Docker (WSL, Docker Desktop) contra Postgres real y se subiÃ³ un padrÃ³n real (`Cargos_salud_20260802.xlsx`, 47.203 filas) por la API, no un mock. Aparecieron **4 bugs adicionales que ningÃºn review de cÃ³digo habÃ­a detectado** porque solo se manifiestan corriendo el flujo real de punta a punta â€” mismo patrÃ³n que el hallazgo #1 de Agustin (uno de ellos, el #4, ni siquiera tira error: devuelve 200 OK y hace `COMMIT` sin haber hecho la mitad del trabajo):

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | **`POST /upload` se colgaba indefinidamente** (`padron.routes.ts`) â€” el handler itera `request.parts()` con `for await` y para el part de tipo `file` solo guardaba la referencia (`file = part`) sin consumir el stream; `file.toBuffer()` se llamaba reciÃ©n despuÃ©s, dentro de `uploadPadronService`, fuera del loop. Gotcha conocido de `@fastify/multipart`: si el stream de un `file` part no se drena mientras estÃ¡ activo en el iterador, `busboy` no puede avanzar al siguiente part â€” y como el archivo es la Ãºltima parte del multipart, el `for await` nunca termina. La request quedaba colgada sin loggear error ni completar (confirmado: 10+ min sin respuesta, Dotaneitor sin recibir ni `POST /session` ni `POST /upload-cargos`, cero llamadas en sus logs). | ðŸ”´ **CrÃ­tica** â€” invalidaba S2-2/S2-3/S2-18 en runtime (el upload async nunca llegaba a dispararse) | âœ… **Corregido** â€” se resuelve `part.toBuffer()` inline dentro del loop, apenas se detecta el part de tipo `file`, y se pasa el buffer ya resuelto (no el `MultipartFile` crudo) a `uploadPadronService`. |
| 2 | **Pipeline de Dotaneitor crasheaba en el paso `procesar`** (`Dotaneitor.py:196`) al ajustar `AGRUPADOR` para `COD_SIT=32`. La columna se crea con `df['AGRUPADOR'] = df['CRUCE_AGRUPADOR'].map(agrupador_map)`; si para el archivo real ningÃºn cruce matcheaba la tabla de referencia (o los matches daban NaN), pandas inferÃ­a la columna entera como `float64`. La lÃ­nea siguiente intenta escribir el string `'Enfermero/a ATP'` en esa columna â€” pandas moderno ya no hace el upcast implÃ­cito `float64â†’object` y tira `TypeError` (`LossySetitemError`), tumbando todo el job en Python. El reporte de calidad que ya existe para esto (`agrupador_no_encontrado`, `detalle_sin_agrupador`, secciÃ³n 292/303 del archivo) nunca llegaba a generarse porque el crash pasaba antes. | ðŸ”´ **CrÃ­tica** â€” bloqueaba el paso `procesar` con cualquier padrÃ³n real | âœ… **Corregido** â€” `.astype('object')` explÃ­cito sobre la columna reciÃ©n mapeada, antes de la asignaciÃ³n condicional. No cambia ningÃºn valor, solo garantiza que la columna pueda contener strings. |
| 3 | **`aprobarSnapshotService` fallaba con `P2000` ("value too long for column type")** al crear un `Escalafon` nuevo â€” `tx.escalafon.create({ data: { codigo: nombre, nombre } })` reutiliza el nombre completo del escalafÃ³n como `codigo`, pero `Escalafon.codigo` es `VARCHAR(20)` en el schema (`Escalafon.nombre` es `VARCHAR(100)`). Cualquier nombre de escalafÃ³n real de mÃ¡s de 20 caracteres rompÃ­a el `create` y hacÃ­a rollback total de la transacciÃ³n de aprobaciÃ³n (confirmado: 0 filas en `personas`/`cargos`/`ocupaciones`/`historico` tras el rollback, pese a que el diff se habÃ­a calculado bien â€” 46.889 "nuevo"). `codigo` no se lee en ningÃºn otro lugar del repo (confirmado por grep) â€” el lookup de esta misma funciÃ³n es por `nombre`, no por `codigo`. | ðŸ”´ **CrÃ­tica** â€” bloqueaba el `aprobar` en el primer uso real, exactamente el mismo patrÃ³n de "primera aprobaciÃ³n contra Postgres reciÃ©n migrado" que el hallazgo #1 de arriba, pero en un punto distinto del cÃ³digo | âœ… **Corregido** â€” `codigo` ahora se genera como `nombre.slice(0, 12) + '-' + randomUUID().slice(0, 7)` (20 caracteres exactos, Ãºnico, no depende de la longitud del nombre real). |
| 4 | **`aprobarSnapshotService` nunca creaba personas ni ocupaciones â€” falla silenciosa, sin excepciÃ³n, `aprobar` devolvÃ­a 200 OK igual.** `calcularDiff()` guarda `cuil_y_rol` ("`<CUIL 11 dÃ­gitos>-<rol>`") en el JSON de cada diff "nuevo" â€” nunca un campo `cuil` suelto. `aprobarSnapshotService` leÃ­a `datos.cuil` (inexistente, siempre `undefined`) en 3 puntos: para armar `cuilsNecesarios` de la precarga, para el guard que decide si crear una `Persona` nueva, y para buscar la `persona` al armar cada `Ocupacion`. Con `datos.cuil` siempre `undefined`, `personasACrear` y `ocupacionesACrear` quedaban **siempre vacÃ­os** â€” 0 personas, 0 ocupaciones, y por lo tanto 0 histÃ³rico (que se arma leyendo las ocupaciones reciÃ©n creadas). `cargosACrear` sÃ­ funcionaba (usa `datos.id_sial`, un campo que sÃ­ existe), asÃ­ que la transacciÃ³n hacÃ­a `COMMIT` con 46.889 `cargos` creados y **0 en todo lo demÃ¡s**, sin ningÃºn error â€” el fix del hallazgo #3 de arriba (el `P2000` de Escalafon) fue lo que destapÃ³ esto: al dejar de romper, el `aprobar` "funcionaba" (200 OK) pero silenciosamente no hacÃ­a la mitad del trabajo. Se detectÃ³ reciÃ©n comparando conteos reales en la BD contra lo esperado, no por ningÃºn error en logs. | ðŸ”´ **CrÃ­tica** â€” invalidaba el criterio de Ã©xito central del sprint ("datos reales cargados") pese a un 200 OK limpio; el bug mÃ¡s peligroso de los 4 porque no se manifiesta como error | âœ… **Corregido** â€” nueva funciÃ³n `cuilDe(datos)` que deriva el CUIL puro desde `cuil_y_rol` (`.split('-')[0]`), usada en los 3 puntos que antes leÃ­an `datos.cuil`. |

Con los 4 fixes aplicados, el flujo completo corriÃ³ de punta a punta contra datos reales: upload (202 inmediato) â†’ `normalizar` â†’ `procesar` â†’ `cruzar` â†’ `diff` (46.889 nuevos, 0 modificados/eliminados â€” coherente con partir de un `Cargo` vacÃ­o) â†’ `guardando` â†’ `pendiente` â†’ **aprobar â†’ 200 OK, `COMMIT`**. Conteos finales verificados en la BD real (no solo el 200 OK): **45.083 `personas`, 46.889 `cargos`, 46.889 `ocupaciones`, 46.889 `padron_historico`** â€” los dos primeros nÃºmeros coinciden exactamente con los ya documentados del sistema legacy (`personas_dotacion`: 45.083 personas; `cargo_dotacion`: 46.889 registros activos, ver `ARQUITECTURA_ONBOARDING.md` del proyecto `dotacion-rrhh`), una validaciÃ³n cruzada fuerte de que los datos reales quedaron bien cargados y no son ruido. Tiempo de aprobaciÃ³n con el fix: ~35s (haciendo el trabajo real de crear ~46.889 personas + ocupaciones + histÃ³rico), dentro del objetivo de "< 60s para 48k registros" de la secciÃ³n 8.

Hallazgos adicionales, no bloqueantes pero relevantes:
- **`apps/api/Dockerfile` no existÃ­a** en el repo pese a que `docker-compose.yml` lo referencia â€” cualquier `docker compose up --build` fallaba antes de llegar a levantar nada. Creado (corre `tsx watch`, igual que `pnpm dev`), junto con un `.dockerignore` que faltaba (sin Ã©l, `node_modules` de Windows se mandaba entero al build context).
- La imagen `node:20-alpine` no traÃ­a `libssl` â€” el motor de schema de Prisma crasheaba al arrancar con un error no-JSON que rompÃ­a el parseo (`apk add openssl` agregado al Dockerfile).
- `prisma/migrations/` estaba **vacÃ­o** en el repo pese a que S0-2 ("primera migraciÃ³n") figura âœ…. CorrecciÃ³n al diagnÃ³stico original: la tabla `_prisma_migrations` de la BD real sÃ­ tenÃ­a un registro (`20260820151826_init`, aplicada 2026-08-20) â€” o sea que S0-2 sÃ­ corriÃ³ `migrate dev` en su momento, pero el archivo de esa migraciÃ³n nunca llegÃ³ a este checkout del repo (Â¿no comiteado, `.gitignore` de otra mÃ¡quina, o se perdiÃ³ en algÃºn punto?). El historial versionado en git, que es lo que importa para reproducibilidad, estaba vacÃ­o igual. âœ… **Resuelto (2026-08-25)** â€” bauteo (baseline) sin tocar datos: `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (comando de solo lectura) generÃ³ `prisma/migrations/0_init/migration.sql` reflejando el schema actual completo; se agregÃ³ `prisma/migrations/migration_lock.toml` (provider `postgresql`); `prisma migrate resolve --applied 0_init` marcÃ³ esa migraciÃ³n como aplicada en la BD real (solo escribe en `_prisma_migrations`, no ejecuta el SQL â€” las tablas ya existÃ­an). Verificado con `prisma migrate status`: **"Database schema is up to date!"**, cero drift. Conteos de `personas`/`cargos`/`ocupaciones`/`historico` confirmados intactos antes y despuÃ©s.
- `pnpm db:seed` (script raÃ­z) estaba roto: `tsx` no estÃ¡ en `node_modules/.bin` de la raÃ­z (solo es dependencia de `apps/api`) â€” y ademÃ¡s `prisma/seed.ts` importa `bcrypt`, que tampoco es dependencia de la raÃ­z, asÃ­ que agregar solo `tsx` no habrÃ­a alcanzado. âœ… **Resuelto (2026-08-25)** â€” el script ahora delega a `apps/api` (que ya tiene `tsx`/`bcrypt`/`@prisma/client` resueltos vÃ­a pnpm workspace): `"db:seed": "pnpm --filter @srrhh/api exec tsx --env-file=.env ../../prisma/seed.ts"`. Corrido de verdad contra la BD real (`prisma/seed.ts` es idempotente, usa `upsert` en todo): `ðŸŒ± ... ðŸŽ‰ Seed completado` sin errores, sin duplicar nada.

---

### SPRINT 3 â€” Personas y Cargos

**DuraciÃ³n:** 2 semanas | **Capacidad:** 120h
**Objetivo:** MÃ³dulos de personas y cargos completamente funcionales.

| #     | Tarea                                                           | Dev     | Est. | Prioridad  |     |
| ----- | --------------------------------------------------------------- | ------- | ---- | ---------- | --- |
| S3-1  | `GET /api/v1/personas` paginado con full-text search PostgreSQL | Jorge   | 6h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-2  | `GET /api/v1/personas/:id` con ocupaciones activas              | Jorge   | 3h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-3  | Filtros personas: hospital, escalafÃ³n, activo, bÃºsqueda libre   | Jorge   | 4h   | ðŸŸ¡ Medio   | âœ…  |
| S3-4  | `GET /api/v1/cargos` paginado con filtros                       | Jorge   | 4h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-5  | `GET /api/v1/cargos/:id` con ocupaciÃ³n actual                   | Jorge   | 3h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-6  | PersonasPage: tabla con bÃºsqueda debounce 300ms                 | Agustin | 8h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-7  | PersonaDetailPanel: panel lateral con datos + ocupaciones       | Agustin | 8h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-8  | CargosPage: tabla con filtros por hospital y escalafÃ³n          | Agustin | 8h   | ðŸ”´ CrÃ­tico | âœ…  |
| S3-9  | CargoDetailPanel: panel lateral con cargo + persona actual      | Agustin | 6h   | ðŸŸ¡ Medio   | âœ…  |
| S3-10 | Exportar a Excel desde PersonasPage y CargosPage                | Agustin | 4h   | ðŸŸ¢ Bajo    | âœ…  |
| S3-11 | Ãndice GIN tsvector en `personas.apellido_nombre` (migraciÃ³n)   | Jorge   | 3h   | ðŸŸ¡ Medio   | âœ…  |

**Criterio de Ã©xito:**

- BÃºsqueda de personas por nombre/CUIL/DNI funciona con full-text search
- Filtros por hospital y escalafÃ³n funcionan
- Panel de detalle muestra ocupaciones activas
- ExportaciÃ³n a Excel disponible

**Backend listo, verificado contra datos reales (Jorge + Claude, 2026-08-25) â€” desbloquea a Agustin para S3-6 a S3-10:**

Las 5 tareas de Jorge (S3-1 a S3-5, S3-11) se implementaron y probaron contra la BD real cargada en Sprint 2 (45.083 personas, 46.889 cargos), no contra datos de prueba:

- `GET /api/v1/personas` â€” full-text search real de Postgres (`to_tsvector('spanish', apellido_nombre) @@ plainto_tsquery(...)`, apoyado en el Ã­ndice GIN de S3-11) combinado con `ILIKE` sobre `cuil`/`numero_doc` para bÃºsquedas exactas. Probado con `search=Gonzalez`: matchea apellidos compuestos como "Alarcon Gonzalez" (623 resultados), no solo coincidencia exacta al inicio del string. Filtros `hospitalId`/`escalafonId` cruzan por la ocupaciÃ³n vigente (`hasta IS NULL`) vÃ­a `EXISTS` â€” Prisma no soporta bien mezclar `$queryRaw` con relation-filters del query builder, asÃ­ que todo el listado (bÃºsqueda + filtros + paginaciÃ³n) es una sola query raw parametrizada (`Prisma.sql`, sin riesgo de inyecciÃ³n).
- `GET /api/v1/personas/:id` â€” Prisma `include` anidado (`ocupaciones.cargo.hospital`/`escalafon`), sin necesidad de raw SQL. Devuelve la forma `PersonaDetail` ya agregada a `packages/types`.
- `GET /api/v1/cargos` â€” filtros por `hospitalId`/`escalafonId`/`estado` directos (son FK/enum en `Cargo`) + `search` con `OR`/`contains` sobre `idSial`/`literalPuesto`/`especialidad`/`agrupador`. `hospital`/`escalafon` siempre expandidos (necesario para la tabla del frontend).
- `GET /api/v1/cargos/:id` â€” `ocupacionActual` (la fila con `hasta IS NULL`, o `null` si el cargo estÃ¡ vacante) con `persona` expandida. Forma `CargoDetail`, tambiÃ©n agregada a `packages/types`.
- Tiempos de respuesta medidos contra los datos reales: 8-30ms en todos los casos probados (listado simple, bÃºsqueda full-text, filtro por hospital, detalle con relaciones) â€” muy por debajo del objetivo de <500ms de la secciÃ³n 8.
- `packages/types` ganÃ³ `PersonaDetail` y `CargoDetail` (antes no existÃ­an formas explÃ­citas para las respuestas de detalle con relaciones expandidas) â€” Agustin puede tipar `PersonaDetailPanel`/`CargoDetailPanel` (S3-7/S3-9) contra estos tipos sin adivinar la forma de la respuesta.

`PersonaFilters`/`CargoFilters` en `packages/types` ya reflejan exactamente los query params que aceptan los endpoints reales, asÃ­ que los hooks de TanStack Query se pueden tipar contra eso directamente.

**Frontend (S3-6 a S3-10) implementado y verificado visualmente con browser real (Jorge + Claude, 2026-08-25):**

Para no dejar bloqueado a Agustin mÃ¡s de lo necesario, se implementÃ³ tambiÃ©n el frontend completo del sprint (originalmente asignado a Agustin) siguiendo exactamente los patrones ya establecidos en `modules/padron` (mismas clases Tailwind/Obelisco, mismo patrÃ³n de hooks TanStack Query, misma estructura de tabla + paginaciÃ³n):

- `PersonasPage` (S3-6) â€” tabla con bÃºsqueda (debounce 300ms vÃ­a `useDebounce`, nuevo hook compartido) + filtros por hospital/escalafÃ³n/activo (S3-3), paginaciÃ³n.
- `PersonaDetailPanel` (S3-7) â€” datos personales completos (incluye los campos de contacto/domicilio de S2-17, que no estaban en el tipo `Persona` compartido â€” se agregaron a `PersonaDetail`, ver hallazgo abajo) + tabla de ocupaciones (vigente primero).
- `CargosPage` (S3-8) â€” tabla con filtros por hospital/escalafÃ³n/estado + bÃºsqueda (agregada mÃ¡s allÃ¡ del pedido mÃ­nimo del ticket, con el mismo debounce, ya que el backend de S3-4 ya la soportaba).
- `CargoDetailPanel` (S3-9) â€” datos del cargo + persona actual (o "vacante" si `ocupacionActual` es `null`), con link cruzado a `PersonaDetailPanel`.
- `exportToCsv` (S3-10) â€” sin agregar una librerÃ­a nueva (no habÃ­a `xlsx`/`sheetjs` en el proyecto y es una tarea ðŸŸ¢ Bajo): CSV con BOM UTF-8, que Excel abre nativamente. Exporta la pÃ¡gina actual, no "todo lo filtrado" (con 45k+ personas, eso necesitarÃ­a un endpoint sin paginar aparte, fuera de alcance de esta tarea) â€” el botÃ³n lo aclara.
- Endpoint nuevo no contemplado en el plan original: `GET /api/v1/escalafones` â€” no existÃ­a ningÃºn endpoint de catÃ¡logo de escalafones (solo `hospitales`), y los selectores de filtro de S3-3/S3-8 lo necesitan.

**Hallazgos de la verificaciÃ³n (no bloqueantes, corregidos en el momento):**

| # | Hallazgo | Estado |
|---|---|---|
| 1 | `Persona` en `packages/types` no incluÃ­a los campos de contacto/domicilio de S2-17 (`telefono`, `mailPersonal`, `mailLaboral`, `domicilio`, `localidad`, `provincia`, `antiguedadDesde`) pese a que sÃ­ existen en el modelo Prisma y `getPersonaByIdService` los devuelve (no usa `select`). `tsc` lo agarrÃ³ solo al escribir `PersonaDetailPanel`. | âœ… Agregados a `PersonaDetail` (no a `Persona` base, que sÃ­ refleja fielmente lo que devuelve el listado â€” ver comentario en el tipo). |
| 2 | VerificaciÃ³n visual con Playwright + Chrome real (headless) contra la BD real: primer intento pisÃ³ sin querer el puerto 5173 de **otra aplicaciÃ³n ajena** ("TorneoApp", ya visible en la sesiÃ³n desde antes por logs pegados por error) â€” `vite --strictPort` sÃ­ fallÃ³ como corresponde, pero el `curl` de verificaciÃ³n pegÃ³ contra la otra app y dio un falso positivo de "server up". Se relanzÃ³ en el puerto 5180. | ðŸ“‹ Nada que corregir en el cÃ³digo â€” error de metodologÃ­a de prueba, documentado para no repetirlo. |
| 3 | Con el puerto cambiado a 5180, `CORS_ORIGINS` de la API (hardcodeado a `5173` en `docker-compose.yml`) bloqueaba todo. | âœ… Agregado `5180` en `docker-compose.override.yml` (no commiteado, ya es el archivo para overrides de esta mÃ¡quina). |
| 4 | `GET /api/v1/escalafones` (el endpoint nuevo del hallazgo de arriba) daba 404 en el browser real pese a andar bien por `curl` directo â€” el container `api` se habÃ­a reiniciado para tomar el nuevo `CORS_ORIGINS` con `docker compose up -d api` **sin `--build`**, asÃ­ que seguÃ­a corriendo la imagen vieja, de antes de agregar la ruta. El selector de escalafÃ³n se veÃ­a "andando" en la captura porque solo mostraba la opciÃ³n por default ("Todos los escalafones") â€” nunca se habÃ­a probado seleccionar una opciÃ³n real. | âœ… Rebuild (`--build`) del container. Confirmado con logging de requests: cero errores HTTP en toda la corrida despuÃ©s del fix. |

Verificado con capturas de pantalla reales: login â†’ `/personas` (lista, bÃºsqueda "Gonzalez" con resultados reales, filtro por escalafÃ³n "MÃ©dicos" cambiando la lista) â†’ detalle de persona (ocupaciones con hospital/escalafÃ³n/estado reales) â†’ `/cargos` (lista, filtro por escalafÃ³n) â†’ detalle de cargo â†’ "Ver persona" navega de vuelta al mismo registro de persona (mismo CUIL, misma ocupaciÃ³n) â€” loop de navegaciÃ³n cruzada cargoâ†”persona confirmado consistente. Exportar CSV disparÃ³ una descarga real (`personas_pagina-1.csv`) verificada por el listener de `download` del browser, no solo "no tirÃ³ error".

âš ï¸ **Choque de trabajo en paralelo (2026-08-25):** Jorge y Agustin implementaron S3-6 a S3-10 de
forma independiente y simultÃ¡nea, sin coordinarse â€” Agustin mergeÃ³ primero a `main` (vÃ­a `develop`),
Jorge lo descubriÃ³ reciÃ©n al hacer `git pull` antes de mergear su propia rama, con conflictos
`add/add` en los 8 archivos nuevos del frontend. Jorge decidiÃ³ mantener su propia versiÃ³n (ya
verificada con browser real, ver arriba) y descartar la implementaciÃ³n de Agustin en el merge â€” las
notas de Agustin abajo describen su versiÃ³n, **que ya no estÃ¡ en el cÃ³digo** (se preservan como
registro y porque su hallazgo #S3-7 es real y se verificÃ³ contra la versiÃ³n que sÃ­ quedÃ³, ver nota
al final de esta secciÃ³n). Dos cosas rescatadas de su trabajo antes de descartarlo:
- El endpoint `GET /api/v1/escalafones` â€” ambos lo agregaron por separado, prÃ¡cticamente idÃ©ntico;
  quedÃ³ la versiÃ³n de Jorge (que ya estaba mergeada) sin cambios funcionales.
- El bug de timezone en fechas (`new Date(iso)` + `toLocaleDateString` corre un dÃ­a para atrÃ¡s en
  UTC-3) â€” la versiÃ³n de Jorge nunca pasa las fechas por `new Date()` en el frontend (las muestra
  como vienen de la API), asÃ­ que no tiene ese bug especÃ­fico, pero tampoco las formatea â€” quedan
  como ISO crudo. Se aprovechÃ³ el hallazgo para formatearlas bien de una, evitando el mismo patrÃ³n
  peligroso que encontrÃ³ Agustin.

**S3-6 completado y verificado por Agustin (2026-08-25) â€” implementaciÃ³n descartada en el merge, ver nota de arriba:** `PersonasPage` â€” tabla, bÃºsqueda con
debounce de 300ms (`useDebouncedValue`, hook nuevo en `shared/hooks/`), y de paso los 3 filtros
completos (hospital, escalafÃ³n, activo) en vez de solo bÃºsqueda, ya que estaban en el contrato
(`PersonaFilters`) aunque no nombrados en el tÃ­tulo de la tarea. RequiriÃ³ agregar
`GET /api/v1/escalafones` (no existÃ­a â€” `hospitales.routes.ts` sÃ­ tenÃ­a su equivalente, este lo
espeja) para poder poblar el dropdown de escalafÃ³n sin pedir el UUID a mano; registrado en `app.ts`.
`useHospitales` se moviÃ³ de `modules/usuarios/hooks/` a `shared/hooks/useCatalogos.ts` (ya no tiene
sentido que viva bajo usuarios si personas/cargos tambiÃ©n lo necesitan) â€” re-exportado desde su
ubicaciÃ³n anterior para no romper el import existente en `AdminUsuariosPage`. Fila de la tabla
navega a `/personas/:id` (placeholder hasta S3-7). Verificado con Chrome headless vÃ­a CDP (red
mockeada): debounce real (tipear letra por letra dispara una sola request, no una por tecla),
filtros combinables entre sÃ­ y con la bÃºsqueda, paginaciÃ³n preservando los filtros activos,
navegaciÃ³n al hacer clic en una fila, estados vacÃ­o y de error. Sin errores de consola en ningÃºn
caso. `tsc --noEmit` limpio en `apps/web` y `apps/api`.

**S3-7 completado y verificado por Agustin (2026-08-25) — implementación descartada, ver nota de arriba:** `PersonaDetailPanel` â€” reemplaza el
placeholder en `/personas/:id`. Datos de la persona (CUIL, documento, sexo, fecha de nacimiento,
especialidad principal) + dos tablas de ocupaciones (vigentes y histÃ³rico, separadas por
`hasta === null`). Encontrado y corregido en la verificaciÃ³n: `formatFecha` armaba la fecha con
`new Date(iso)` (parsea como UTC medianoche) y la mostraba con `toLocaleDateString` (timezone
local) â€” en Argentina (UTC-3) eso corrÃ­a cualquier fecha un dÃ­a para atrÃ¡s (`"2020-01-01"` se
mostraba `31/12/2019`). Se arma la fecha a mano desde los componentes de calendario del string, sin
pasar por UTC. Verificado con CDP: flujo feliz (fechas correctas, ocupaciones vigentes/histÃ³rico
separadas bien), error (persona no encontrada), y persona sin ocupaciones (oculta la secciÃ³n de
histÃ³rico, muestra el estado vacÃ­o en vigentes). Sin errores de consola. `tsc --noEmit` limpio.

**S3-8 completado y verificado por Agustin (2026-08-25) — implementación descartada, ver nota de arriba:** `CargosPage` â€” mismo patrÃ³n que
`PersonasPage` (tabla, bÃºsqueda debounce 300ms, filtros combinables), con `estado` (vigente/no
vigente/todos, default "vigentes") en vez de `activo`. Fila navega a `/cargos/:id` (placeholder
hasta S3-9). Verificado con CDP: filtro de estado preseleccionado en "vigentes", debounce real (una
sola request), navegaciÃ³n al hacer clic, estados vacÃ­o y de error. Sin errores de consola.
`tsc --noEmit` limpio.

**S3-9 completado y verificado por Agustin (2026-08-25) — implementación descartada, ver nota de arriba:** `CargoDetailPanel` â€” reemplaza el
placeholder en `/cargos/:id`. Datos del cargo (hospital, escalafÃ³n, rÃ©gimen, especialidad,
agrupador, unificador de puesto) + secciÃ³n de ocupaciÃ³n actual: si `ocupacionActual` es `null`
muestra "Cargo vacante"; si no, muestra la persona (con link directo a `/personas/:id`, cruzando
con S3-7), CUIL, situaciÃ³n de revista y estado. Verificado con CDP: cargo ocupado (incluyendo el
link a la persona), cargo vacante, y error (cargo no encontrado). Sin errores de consola.
`tsc --noEmit` limpio.

---

### SPRINT 4 â€” Concursos CPH

**DuraciÃ³n:** 2 semanas | **Capacidad:** 120h
**Objetivo:** MÃ³dulo de seguimiento CPH completamente funcional.

| #     | Tarea                                                         | Dev     | Est. | Prioridad  |
| ----- | ------------------------------------------------------------- | ------- | ---- | ---------- |
| S4-1  | `GET /api/v1/concursos-cph` paginado con filtros              | Jorge   | 5h   | ðŸ”´ CrÃ­tico |
| S4-2  | `GET /api/v1/concursos-cph/:id` detalle completo              | Jorge   | 3h   | ðŸ”´ CrÃ­tico |
| S4-3  | `PATCH /api/v1/concursos-cph/:id` actualizar campos por fase  | Jorge   | 6h   | ðŸ”´ CrÃ­tico |
| S4-4  | LÃ³gica `calcSubEstado`: 18 niveles calculados automÃ¡ticamente | Jorge   | 8h   | ðŸ”´ CrÃ­tico |
| S4-5  | `POST /api/v1/concursos-cph/:id/suspender`                    | Jorge   | 2h   | ðŸŸ¡ Medio   |
| S4-6  | `POST /api/v1/concursos` crear concurso desde baja            | Jorge   | 4h   | ðŸ”´ CrÃ­tico |
| S4-7  | ConcursosCphPage: tabla con sub-estado, filtros, alertas      | Agustin | 10h  | ðŸ”´ CrÃ­tico |
| S4-8  | ConcursoCphDetail: formulario completo por fases              | Agustin | 12h  | ðŸ”´ CrÃ­tico |
| S4-9  | Timeline visual del sub-estado (barra de progreso)            | Agustin | 6h   | ðŸŸ¡ Medio   |
| S4-10 | Alertas: concursos sin movimiento > 30/60/90 dÃ­as             | Agustin | 4h   | ðŸŸ¡ Medio   |
| S4-11 | `GET /api/v1/kpis/concursos-cph` para tablero                 | Jorge   | 4h   | ðŸŸ¡ Medio   |

**Criterio de Ã©xito:**

- Sub-estado calculado automÃ¡ticamente, no editable manualmente
- Alexis/CPH puede ver y actualizar todos sus concursos
- Alertas visibles para concursos estancados
- KPIs disponibles para el tablero

---

### SPRINT 5 â€” Concursos CEETPS + Bajas

**DuraciÃ³n:** 2 semanas | **Capacidad:** 120h
**Objetivo:** MÃ³dulo CEETPS y flujo baja â†’ concurso funcional.

| #    | Tarea                                                              | Dev     | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------ | ------- | ---- | ---------- |
| S5-1 | `GET/PATCH /api/v1/concursos-ceetps` con filtros                   | Jorge   | 6h   | ðŸ”´ CrÃ­tico |
| S5-2 | ConcursosCeetpsPage: tabla con estado, escalafÃ³n, filtros          | Agustin | 10h  | ðŸ”´ CrÃ­tico |
| S5-3 | ConcursoCeetpsDetail: formulario por fases ENF/TEC/EG              | Agustin | 10h  | ðŸ”´ CrÃ­tico |
| S5-4 | MÃ³dulo Bajas: `POST /api/v1/concursos` con origen baja             | Jorge   | 6h   | ðŸ”´ CrÃ­tico |
| S5-5 | LÃ³gica: baja con `genera_concurso` â†’ crea seguimiento automÃ¡tico   | Jorge   | 6h   | ðŸ”´ CrÃ­tico |
| S5-6 | BajasPage: tabla + formulario nueva baja                           | Agustin | 8h   | ðŸ”´ CrÃ­tico |
| S5-7 | ConexiÃ³n baja â†’ cargo: marcar cargo `no_vigente` al registrar baja | Jorge   | 4h   | ðŸ”´ CrÃ­tico |
| S5-8 | `GET /api/v1/kpis/concursos-ceetps` para tablero                   | Jorge   | 3h   | ðŸŸ¡ Medio   |
| S5-9 | Alertas CEETPS: concursos sin movimiento                           | Agustin | 3h   | ðŸŸ¡ Medio   |

**Criterio de Ã©xito:**

- Rijana puede gestionar concursos CEETPS desde la app
- Una baja genera automÃ¡ticamente el seguimiento correspondiente
- El cargo se marca `no_vigente` al registrar la baja

---

### SPRINT 6 â€” Tablero KPIs + cierre MVP

**DuraciÃ³n:** 1 semana | **Capacidad:** 60h
**Objetivo:** Dashboard operativo con KPIs reales y sistema listo para producciÃ³n.

| #    | Tarea                                                                           | Dev             | Est. | Prioridad  |
| ---- | ------------------------------------------------------------------------------- | --------------- | ---- | ---------- |
| S6-1 | `GET /api/v1/kpis/dotacion`: total vigentes, vacantes, por carrera, por efector | Jorge           | 6h   | ðŸ”´ CrÃ­tico |
| S6-2 | KpisPage: cards con borde amarillo, skeleton loading                            | Agustin         | 6h   | ðŸ”´ CrÃ­tico |
| S6-3 | KPIs concursales: por sub-estado, tiempo promedio por etapa                     | Jorge           | 6h   | ðŸ”´ CrÃ­tico |
| S6-4 | Filtro por hospital en todo el tablero                                          | Agustin         | 4h   | ðŸŸ¡ Medio   |
| S6-5 | GrÃ¡fico evoluciÃ³n dotaciÃ³n histÃ³rica (padron_historico)                         | Agustin         | 6h   | ðŸŸ¡ Medio   |
| S6-6 | Alertas activas: concursos vencidos, bajas sin concurso                         | Jorge           | 4h   | ðŸŸ¡ Medio   |
| S6-7 | Preparar docker-compose de producciÃ³n                                           | Jorge           | 4h   | ðŸ”´ CrÃ­tico |
| S6-8 | Smoke test completo del sistema                                                 | Jorge + Agustin | 4h   | ðŸ”´ CrÃ­tico |

**Criterio de Ã©xito:**

- Tablero carga en < 3 segundos
- KPIs reflejan datos reales del padrÃ³n aprobado
- Sistema listo para deploy en servidor propio

---

## 5. BACKLOG â€” Fuera de sprints actuales

| #   | Tarea                         | Motivo de postergaciÃ³n             |
| --- | ----------------------------- | ---------------------------------- |
| B-1 | Portal Postulante             | Sistema separado, fuera de alcance |
| B-2 | IntegraciÃ³n API TAD           | No disponible en primera etapa     |
| B-3 | Firma digital real            | No disponible en primera etapa     |
| B-4 | IntegraciÃ³n Hacienda          | No disponible en primera etapa     |
| B-5 | Redis cache para KPIs pesados | No necesario en arranque           |
| B-6 | MÃ³dulo de recorridas          | No urgente para MVP                |
| B-7 | Notificaciones por email      | Segunda fase                       |
| B-8 | App mobile nativa             | Segunda fase                       |
| B-9 | Multi-tab refresh token coordination (`BroadcastChannel`) | Trade-off aceptado con localStorage â€” no priorizado |
| B-10 | Migrar refresh token a cookie httpOnly + endpoint `/me` | Mejora de seguridad XSS â€” no priorizado para MVP |

---

## 6. FLUJO DE DEPLOY

```
Desarrollo local
  â†’ git push origin feature/xxx
  â†’ PR a develop
  â†’ Review + merge

Staging (a definir):
  â†’ Servidor propio (VPS)
  â†’ docker-compose up -d
  â†’ prisma migrate deploy

ProducciÃ³n:
  â†’ Servidor propio
  â†’ Infraestructura a definir en Sprint 6
```

---

## 7. REGISTRO DE DECISIONES

| Fecha   | DecisiÃ³n                                        | Motivo                                                |
| ------- | ----------------------------------------------- | ----------------------------------------------------- |
| 2026-09 | Sin deadline fijo â€” calidad por etapa           | Prioridad en correcciÃ³n, no en velocidad              |
| 2026-09 | Dotaneitor: analizar y optimizar, no reescribir | Ya funciona, Python es el lenguaje correcto para esto |
| 2026-09 | PostgreSQL sobre MySQL                          | Particionado, full-text search, window functions      |
| 2026-09 | shadcn/ui + Tailwind con tokens Obelisco        | Stack moderno + identidad institucional GCBA          |
| 2026-09 | Zustand para estado de auth                     | TanStack Query para servidor, Zustand para cliente    |
| 2026-09 | Docker desde el dÃ­a 1                           | Entorno local = producciÃ³n, deploy trivial            |
| 2026-09 | UUID como PK en todas las tablas                | Sin autoincremental, distribuible                     |
| 2026-09 | Soft delete en todas las tablas                 | HistÃ³rico inmutable, nunca DELETE en producciÃ³n       |
| 2026-09 | ProducciÃ³n en servidor propio                   | A definir en Sprint 6                                 |
| 2026-08-21 | Dotaneitor escribe directo en tablas de catÃ¡logo (`Hospital`, `Escalafon`, `CodigoRegistro`, `Especialidad`, `Puesto`); `Persona`/`Cargo`/`Ocupacion` siguen detrÃ¡s del flujo de aprobaciÃ³n de `padron_diff` | Evita saltear el control humano sobre datos de personas, sin duplicar catÃ¡logos de referencia (acordado Agustin/Jorge â€” ver `Doc/Dotaneitor_Analisis.md` secciÃ³n 4.1) |
| 2026-09 | `Especialidad` y `Puesto` como catÃ¡logos de apoyo sin FK desde `Cargo` â€” `Cargo` mantiene campos de texto libre (`especialidad`, `literalPuesto`, `agrupador`, `unificadorPuesto`) | Cambiar a FK implicaba migraciÃ³n de datos y mayor alcance en Sprint 2; catÃ¡logos paralelos permiten normalizaciÃ³n progresiva sin romper el modelo existente |

---

## 8. MÃ‰TRICAS DE Ã‰XITO DEL MVP

| MÃ©trica                                | Objetivo                          |
| -------------------------------------- | --------------------------------- |
| Tiempo de procesamiento padrÃ³n semanal | < 60 segundos para 48k registros  |
| Tiempo de carga del tablero            | < 3 segundos                      |
| BÃºsqueda de personas                   | < 500ms con full-text search      |
| Errores en producciÃ³n post-deploy      | 0 crÃ­ticos                        |
| Cobertura de flujo concursal CPH       | 100% de sub-estados implementados |
| Cobertura de flujo concursal CEETPS    | 100% de estados implementados     |
