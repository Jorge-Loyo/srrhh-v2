# Contrato de Backend — SRRHH v2

> Define la arquitectura, estructura, convenciones y reglas del servidor.
> Última actualización: 2026-09 (Post-Sprint 16 — filtro conFaltantes concursos CPH + tests + actualización modales flujo)
> Estado: VIGENTE

---

## Stack

| Tecnología   | Versión | Rol                   |
| ------------ | ------- | --------------------- |
| Node.js      | 20 LTS  | Runtime               |
| TypeScript   | 5.x     | Lenguaje              |
| Fastify      | 4.x     | Framework HTTP        |
| Prisma       | 5.x     | ORM + migraciones     |
| PostgreSQL   | 16      | Base de datos         |
| Zod          | 3.x     | Validación de schemas |
| JWT + bcrypt | —       | Autenticación         |
| Docker       | —       | Contenedor            |

---

## Estructura de carpetas

```
apps/api/
├── src/
│   ├── modules/              ← Un módulo por dominio
│   │   ├── auth/
│   │   ├── personas/
│   │   ├── cargos/
│   │   ├── padron/
│   │   ├── concursos/
│   │   ├── concursos-cph/
│   │   ├── concursos-ceetps/
│   │   ├── bajas/
│   │   ├── bajas-sial/
│   │   ├── kpis/
│   │   ├── hospitales/
│   │   ├── escalafones/
│   │   ├── usuarios/
│   │   ├── notificaciones/   ← Sprint 10
│   │   ├── roles/            ← RBAC dinámico (Sprint 9)
│   │   └── permisos/         ← Catálogo de permisos (Sprint 9)
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── permisos.middleware.ts  ← Reemplaza roles.middleware.ts (Sprint 9)
│   │   │   └── audit.middleware.ts
│   │   ├── errors/
│   │   ├── codigoCargo.ts
│   │   ├── prisma.ts
│   │   └── logger.ts
│   ├── config/
│   │   └── env.ts
│   └── app.ts
```

---

## Arquitectura por módulo

Cada módulo sigue el mismo patrón de 3 capas:

```
routes.ts  →  service.ts  →  prisma (DB)
```

**Regla:** las rutas no tienen lógica de negocio. Los services no conocen HTTP. Prisma solo se usa dentro de los services.

---

## Endpoints implementados

```
# Auth
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Catálogos
GET    /api/v1/hospitales
GET    /api/v1/escalafones
GET    /api/v1/puestos
GET    /api/v1/cargos/puestos

# Personas
GET    /api/v1/personas
GET    /api/v1/personas/:id

# Cargos
GET    /api/v1/cargos
GET    /api/v1/cargos/:id
POST   /api/v1/cargos
GET    /api/v1/cargos/altas

# Padrón
POST   /api/v1/padron/upload
GET    /api/v1/padron/snapshots
GET    /api/v1/padron/snapshots/:id
GET    /api/v1/padron/snapshots/:id/estado
GET    /api/v1/padron/snapshots/:id/diff
GET    /api/v1/padron/snapshots/:id/exportar
POST   /api/v1/padron/snapshots/:id/aprobar
POST   /api/v1/padron/snapshots/:id/rechazar

# Concursos (módulo padre)
POST   /api/v1/concursos

# Concursos CPH  (contrato completo: Doc/Contrato_Concursos_CPH.md)
GET    /api/v1/concursos-cph
GET    /api/v1/concursos-cph/jurados-vigentes         ← jurados confirmados (flag vigente, 6 meses)
GET    /api/v1/concursos-cph/ordenes-merito-vigentes  ← OM vigentes con integrantes disponibles
GET    /api/v1/concursos-cph/:id
PATCH  /api/v1/concursos-cph/:id                       ← incluye ifAutorizacion; gatilla autorización SGRASV
POST   /api/v1/concursos-cph/:id/suspender
POST   /api/v1/concursos-cph/:id/autorizar            ← aprobar/rechazar modificación pendiente (rol sgrasv); salta a Etapa 4 si hay candidato de OM reservado
POST   /api/v1/concursos-cph/:id/declarar-desierto    ← acción (relanza desde Etapa 1), no es etapa
POST   /api/v1/concursos-cph/:id/designar             ← designación formal (crea ocupación, finaliza)
GET    /api/v1/concursos-cph/:id/persona-designada    ← persona designada (3 fuentes) — Etapa 5 legacy
GET    /api/v1/concursos-cph/:id/designacion-estado   ← Etapa 5: datos completos + cargo actual + validación (CUIL+carrera+especialidad); setea validado
# Etapa 2 — jurado
POST   /api/v1/concursos-cph/:id/generar-sorteo       ← prioriza Regla 1→2→3 y especialidad
POST   /api/v1/concursos-cph/:id/jurado/reutilizar    ← reutiliza jurado vigente compatible (borrador)
POST   /api/v1/concursos-cph/:id/jurado/confirmar
POST   /api/v1/concursos-cph/:id/jurado/revertir
DELETE /api/v1/concursos-cph/:id/jurado
GET    /api/v1/concursos-cph/:id/jurado
# Etapa 3 — inscriptos / examen / orden de mérito
GET    /api/v1/concursos-cph/:id/inscriptos
POST   /api/v1/concursos-cph/:id/inscriptos
PATCH  /api/v1/concursos-cph/:id/inscriptos/:inscriptoId
DELETE /api/v1/concursos-cph/:id/inscriptos/:inscriptoId
POST   /api/v1/concursos-cph/:id/inscriptos/importar
POST   /api/v1/concursos-cph/:id/inscripciones/cerrar | reabrir
POST   /api/v1/concursos-cph/:id/examen/publicar | despublicar
POST   /api/v1/concursos-cph/:id/presentados/confirmar | revertir
POST   /api/v1/concursos-cph/:id/orden-merito/confirmar | revertir  ← al confirmar puebla OrdenMerito reutilizable
# Etapa 1 — reutilización de OM (panel PanelReutilizarOm; ya NO en Etapa 4)
GET    /api/v1/concursos-cph/:id/om-compatibles       ← OM compatibles (mismo puesto+especialidad+escalafón)
GET    /api/v1/concursos-cph/:id/candidato-om         ← candidato de OM reservado (o null) + disponiblesRestantes
POST   /api/v1/concursos-cph/:id/om/reservar          ← reserva integrante (designado, NO finaliza)
POST   /api/v1/concursos-cph/:id/om/liberar           ← libera la reserva
POST   /api/v1/concursos-cph/:id/om/rechazar          ← no aceptó: anula + libera; devuelve disponiblesRestantes
POST   /api/v1/concursos-cph/importar-csv

# Validación contra padrón (módulo padrón) — ver Doc/Contrato_Concursos_CPH.md §6qua
GET    /api/v1/padron/snapshots/:id/validaciones-preview  ← concursos que pasarán a validados (CUIL+carrera+especialidad)
POST   /api/v1/padron/snapshots/:id/diffs/:diffId/aprobar ← aprobar+vincular; setea ConcursoCph.validado si triangula

# Etiquetas (genérico, entidad concurso_cph)  — permiso { modulo:'etiquetas', accion:'crear' }
GET    /api/v1/etiquetas
POST   /api/v1/etiquetas
PATCH  /api/v1/etiquetas/:id
DELETE /api/v1/etiquetas/:id                          ← soft-delete (activo=false)
POST   /api/v1/etiquetas/:id/asignar                  ← body { entidad, entidadId }
DELETE /api/v1/etiquetas/:id/desasignar               ← body { entidad, entidadId }

# Concursos CEETPS
GET    /api/v1/concursos-ceetps
GET    /api/v1/concursos-ceetps/:id
PATCH  /api/v1/concursos-ceetps/:id

# Bajas
GET    /api/v1/bajas
GET    /api/v1/bajas/:id
POST   /api/v1/bajas
PATCH  /api/v1/bajas/:id          ← editar borrador (resolucion_a_la_firma)
GET    /api/v1/bajas/validacion
GET    /api/v1/bajas/validacion/solo-baja
GET    /api/v1/bajas/validacion/historico
POST   /api/v1/bajas/validacion/:cargoId/confirmar
POST   /api/v1/bajas/validacion/:cargoId/rechazar

# Bajas SIAL
GET    /api/v1/bajas-sial/snapshots
POST   /api/v1/bajas-sial/upload
GET    /api/v1/bajas-sial/snapshots/:id/diff
POST   /api/v1/bajas-sial/snapshots/:id/aprobar
GET    /api/v1/bajas-sial/registros

# KPIs
GET    /api/v1/kpis/concursos-cph
GET    /api/v1/kpis/concursos-ceetps
GET    /api/v1/kpis/dotacion
GET    /api/v1/kpis/concursos
GET    /api/v1/kpis/dotacion-historica
GET    /api/v1/kpis/alertas

# Notificaciones (Sprint 10)
GET    /api/v1/notificaciones
GET    /api/v1/notificaciones/no-leidas
PATCH  /api/v1/notificaciones/leer-todas
PATCH  /api/v1/notificaciones/:id/leer

# Autorizaciones (Sprint 13 + Sprint 15)
GET    /api/v1/autorizaciones
POST   /api/v1/autorizaciones/:id/aprobar
POST   /api/v1/autorizaciones/:id/rechazar

# Solicitudes de Alta (Sprint 13)
GET    /api/v1/solicitudes-alta
POST   /api/v1/solicitudes-alta

# Organigrama (Post-Sprint 14)
GET    /api/v1/organigrama
POST   /api/v1/organigrama/upload   ← solo admin, permiso `configuracion:gestionar_organigrama`

# Usuarios
GET    /api/v1/usuarios
POST   /api/v1/usuarios
PATCH  /api/v1/usuarios/:id

# RBAC dinámico (Sprint 9)
GET    /api/v1/roles
POST   /api/v1/roles
PATCH  /api/v1/roles/:id
DELETE /api/v1/roles/:id
GET    /api/v1/permisos
```

---

## Autenticación y autorización

### Flujo de autenticación

```
POST /api/v1/auth/login
  → valida credenciales (siempre corre bcrypt, incluso si el usuario no existe)
  → devuelve { accessToken (15min), refreshToken (7 días) }

POST /api/v1/auth/refresh
  → rota el token (invalida el anterior, emite uno nuevo)
  → si se detecta reutilización de token revocado → invalida toda la familia

POST /api/v1/auth/logout
  → revoca el refreshToken actual
```

### RBAC dinámico (Sprint 9)

El sistema de permisos fue migrado de `roles.middleware.ts` (roles hardcodeados) a `permisos.middleware.ts` (permisos dinámicos por rol en DB).

- Los roles y sus permisos se gestionan en las tablas `roles` y `permisos`
- `requirePermiso('modulo', 'accion')` reemplaza `requireRole(['admin', 'editor'])`
- Los permisos se cargan desde DB y se cachean por request
- La página `/configuracion/permisos` permite gestionar roles y permisos desde la UI

### Roles base

| Rol                  | Acceso                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `admin`              | Todo                                                                                               |
| `editor`             | Lectura + escritura en todos los módulos                                                           |
| `viewer`             | Solo lectura                                                                                       |
| `director`           | Solo lectura + autorizar concursos CPH                                                             |
| `sgrasv`             | Resolver autorizaciones de cambio de sigla/CR en concursos CPH. Permiso: `concursos-cph.autorizar` |
| `concursales_cph`    | Lectura total + escritura en concursos CPH y bajas                                                 |
| `concursales_ceetps` | Lectura total + escritura en concursos CEETPS y bajas                                              |

---

## Módulo Cargos — especialidad_legacy y búsqueda fuzzy

La columna `especialidad` fue renombrada a `especialidad_legacy` en la migración `20260910000001_especialidades_fk`. Se agregó `especialidad_id` FK → `especialidades`.

**Reglas:**

- `createCargoService` escribe en `especialidadLegacy` (no en `especialidad`, que ya no existe en BD).
- `listCargosService` usa query raw con `LEFT JOIN especialidades e ON e.id = c.especialidad_id` y búsqueda por `similarity(e.nombre, $query) > 0.4` (extensión `pg_trgm`, migración `20260910000002_pg_trgm`).
- El tipo `Cargo` en `packages/types` tiene `especialidadLegacy: string | null`, `especialidadId: string | null` y `especialidad: string | null // @deprecated`.

---

## Módulo Bajas — flujo completo

`createBajaService` ejecuta una sola transacción que:

1. Crea la `Baja` con todos sus campos (ee_baja, partida_presupuestaria, doc_respaldatoria, fecha_pase_paralelo)
2. Si `estado = resolucion_a_la_firma` → borrador, no toca el cargo ni crea concurso
3. Si `estado != resolucion_a_la_firma` → marca el `Cargo` como `no_vigente`
4. Si `generaConcurso: true` → llama a `createConcursoTx(tx, body, usuarioId, bajaId)`

`updateBajaService(id, body, usuarioId)` — solo edita bajas en `resolucion_a_la_firma`. Recibe `usuarioId` para pasarlo a `createConcursoTx` al confirmar.

### Validación de Bajas — triangulación SIAL

La página `/bajas/validacion` cruza tres fuentes para detectar inconsistencias entre el padrón y el archivo SIAL:

**`listValidacionService()`** — cargos en `validacion_vacante`. Usa `$queryRaw` para cruzar con `BajaSialRegistro` del snapshot SIAL más reciente. Devuelve `origen: 'padron' | 'baja_sial' | 'baja_manual' | 'ambos' | 'desconocido'`, `tienePersonaActiva`, `enSial`, `sialFecha`. `origen = 'ambos'` significa que aparece tanto en el padrón como en el archivo SIAL.

**`listSoloBajaSialService()`** — personas en el archivo SIAL que siguen activas en el padrón. Cruce por CUIL normalizado: `baja_sial_registros.cuil` tiene guiones (`27-38327821-5`), `padron_historico.cuil` no los tiene (`27383278215`). Join: `REPLACE(bsr.cuil, '-', '') = ph.cuil`. Usa `DISTINCT ON` para evitar duplicados. Devuelve `cargoId`, `cargoEstado`, `cargoCodigo`.

**`listValidacionHistoricoService()`** — cargos `no_vigente` que aparecen en diffs de padrón eliminados de snapshots aprobados. Últimos 200 registros.

**`confirmarValidacionService(cargoId)`** — reutilizado para ambos tipos de baja (triangulados y solo SIAL). Mueve cargo a `no_vigente`.

**Orden de rutas crítico:** `/solo-baja` e `/historico` deben registrarse antes de `/:cargoId` en `bajas.routes.ts` para que Fastify no los interprete como parámetros dinámicos.

**Nota técnica — `BajaSialSnapshot.estado` es varchar en BD:** aunque el schema Prisma lo define como enum `EstadoSnapshot`, la BD real tiene `character varying`. Cualquier query Prisma con `{ in: ['pendiente','aprobado'] }` falla con `operator does not exist: character varying = "EstadoSnapshot"`. Solución: `$queryRaw` con SQL directo.

**Nota técnica — join `cargos.id_sial` vs `baja_sial_registros.cargo`:** `padron_historico.id_sial_rol` tiene formato largo (`001006950-2-20084429091-2`), `baja_sial_registros.cargo` tiene formato corto (`001006950-2`). Join correcto: `cargos.id_sial = bsr.cargo`.

### Campos de la tabla `bajas`

| Campo                    | Descripción                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `ee_baja`                | Expediente electrónico de la baja                                   |
| `partida_presupuestaria` | Partida presupuestaria del cargo                                    |
| `doc_respaldatoria`      | Documento respaldatorio                                             |
| `fecha_pase_paralelo`    | Fecha de pase paralelo / GT                                         |
| `estado`                 | `resolucion_a_la_firma` \| `pendiente` \| `confirmada` \| `anulada` |

---

## Módulo Concursos CPH — estado calculado y autorizaciones

`calcConcursoCph()` calcula `estado`, `subEstado` (17 niveles: VACANTE + 16 sub-estados reales) y `subEstado3` (8 niveles) server-side en cada create/PATCH. El schema Zod del PATCH usa `.strict()` — no acepta `estado`/`subEstado`/`subEstado3` en el body.

### Sub-estados reales del concurso CPH (`subEstado`)

Orden cronológico del proceso real:

| Sub-estado           | Descripción                                             |
| -------------------- | ------------------------------------------------------- |
| `VACANTE`            | Concurso creado, sin expediente todavía                 |
| `A-CARATULADO`       | EE Concurso caratulado                                  |
| `A-AUTZN`            | En trámite de autorización                              |
| `B-SORTEO JUR`       | Sorteo de jurado realizado                              |
| `C-DISPO DE LLAMADO` | Disposición de llamado emitida y publicada              |
| `D-EXAMEN PUBLICADO` | Inscripción abierta, fecha de examen publicada          |
| `E-ORDEN DE MERITO`  | Orden de mérito confeccionado                           |
| `F-IFACS`            | Adjudicado tramitando IFACS (aptitud médica)            |
| `G-INSAL`            | Tramitando INSAL (informe situación laboral)            |
| `H-TAD`              | EE Designación iniciado en TAD                          |
| `I-CARGA DOCU`       | Documentación del adjudicado cargada                    |
| `J-APTO MED`         | Apto médico confirmado                                  |
| `K-ITE`              | Informe Técnico Económico (verificación presupuestaria) |
| `L-PYCTO DE RESO`    | Proyecto de resolución en revisión legal                |
| `M-RESO A LA FIRMA`  | Resolución aguardando firma ministerial                 |
| `N-DESIGNADO`        | Resolución firmada — persona designada                  |
| `O-ALTA SIAL`        | Alta procesada en SIAL — cargo ocupado                  |

### Filtro `conFaltantes` en `listConcursosCphService`

Filtro booleano que devuelve solo concursos con campos vacíos según su sub-estado actual. Implementado con `$queryRaw` en `concursos-cph.service.ts`. Schema Zod usa `z.enum(['true','false']).transform(v => v === 'true')` (no `z.coerce.boolean()` — no parsea `'false'` correctamente).

### Campo `pendienteAutorizacion` y flujo Director → SGRASV

Cuando el PATCH incluye cambios en `siglaSolicitada` o `codigoRegistroSolicitadoId`, el service activa `pendienteAutorizacion = true` y crea una notificación `autorizacion_pendiente`.

**Flujo según tipo de cambio:**

- Con cambio de sigla/CR → Director debe aprobar primero, luego SGRASV resuelve
- Sin cambio de sigla/CR → SGRASV puede resolver directamente

Guard en `aprobarAutorizacionCphService`:

```
const requiereDirector = !!(existing.siglaSolicitada || existing.codigoRegistroSolicitadoId)
if (requiereDirector && !existing.aprobadoDirector) → 403
```

- `POST /:id/autorizar` requiere permiso `concursos-cph.autorizar` (rol `sgrasv`)
- Body: `{ aprobado: boolean, observaciones?: string }`
- Al resolver: limpia `pendienteAutorizacion`, crea notificación `autorizacion_resuelta` al rol `concursales_cph`

### Campos en `concursos_cph` relacionados con autorizaciones

| Campo                           | Tipo                  | Descripción                                              |
| ------------------------------- | --------------------- | -------------------------------------------------------- |
| `pendiente_autorizacion`        | BOOLEAN default false | Hay una modificación pendiente de aprobación             |
| `sigla_solicitada`              | VARCHAR nullable      | Nueva sigla solicitada (dispara flujo Director → SGRASV) |
| `codigo_registro_solicitado_id` | UUID FK nullable      | Nuevo código de registro solicitado (ídem)               |
| `aprobado_director`             | BOOLEAN default false | El Director ya aprobó el cambio de sigla/CR              |

---

## Módulo Cargos — estado `validacion_vacante`

Además de `vigente` y `no_vigente`, los cargos pueden estar en `validacion_vacante` (Sprint 8A). Este estado intermedio se usa cuando el padrón SIAL detecta una baja pero aún no fue confirmada administrativamente.

---

## Variables de entorno

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/srrhh"
JWT_SECRET="..."
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"
PYTHON_SERVICE_URL="http://localhost:5001"
PORT=3000
NODE_ENV="development"
CORS_ORIGINS="http://localhost:5173,http://localhost:5180"
LOG_LEVEL="info"
```

---

## Exportables CPH/CEETPS — reglas de negocio

- **Validación**: disponible siempre que `getCasoCph(data).validacion` no sea null (casos CPH_ESTANDAR, CPH_JEFATURAS, CPH_COBERTURA_POU, CPH_SUPLENTE).
- **Autorización**: disponible **solo cuando el concurso está caratulado** — es decir, cuando `eeConcurso` (CPH) o `expedienteConcurso` (CEETPS) tienen valor. Sin expediente de concurso el documento no tiene sentido.
- **`cantidadCargos`**: campo `Int default 1` en `concursos_cph` y `concursos_ceetps`. Los exportables usan `data.cantidadCargos ?? 1`. La excepción `apertura2x18hs` de Enfermería siempre muestra `'2'` (hardcodeado por diseño).

---

## Reglas que no se negocian

1. **Validación con Zod en cada endpoint**
2. **Sin lógica en las rutas**
3. **Sin Prisma fuera de los services**
4. **Errores tipados** — todos extienden `AppError`
5. **Audit log en `onResponse`**
6. **TypeScript estricto** — `strict: true`
7. **Variables de entorno validadas** — el servidor no arranca si falta una requerida
8. **Estado calculado server-side** — `estado`/`subEstado` de concursos no son editables por el cliente
9. **`updateBajaService` recibe `usuarioId`** — necesario para `createConcursoTx` al confirmar
