# Contrato de Backend — SRRHH v2

> Define la arquitectura, estructura, convenciones y reglas del servidor.
> Última actualización: 2026-09 (Post-Sprint 12 — UX bajas, wizard CPH, permisos UI)
> Estado: VIGENTE

---

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| TypeScript | 5.x | Lenguaje |
| Fastify | 4.x | Framework HTTP |
| Prisma | 5.x | ORM + migraciones |
| PostgreSQL | 16 | Base de datos |
| Zod | 3.x | Validación de schemas |
| JWT + bcrypt | — | Autenticación |
| Docker | — | Contenedor |

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

# Concursos CPH
GET    /api/v1/concursos-cph
GET    /api/v1/concursos-cph/:id
PATCH  /api/v1/concursos-cph/:id
POST   /api/v1/concursos-cph/:id/suspender
POST   /api/v1/concursos-cph/:id/autorizar   ← aprobar/rechazar modificación pendiente (rol sgrasv)

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

| Rol | Acceso |
|---|---|
| `admin` | Todo |
| `editor` | Lectura + escritura en todos los módulos |
| `viewer` | Solo lectura |
| `director` | Solo lectura + autorizar concursos CPH |
| `sgrasv` | Resolver autorizaciones de cambio de sigla/CR en concursos CPH. Permiso: `concursos-cph.autorizar` |
| `concursales_cph` | Lectura total + escritura en concursos CPH y bajas |
| `concursales_ceetps` | Lectura total + escritura en concursos CEETPS y bajas |

---

## Módulo Bajas — flujo completo

`createBajaService` ejecuta una sola transacción que:
1. Crea la `Baja` con todos sus campos (ee_baja, partida_presupuestaria, doc_respaldatoria, fecha_pase_paralelo)
2. Si `estado = resolucion_a_la_firma` → borrador, no toca el cargo ni crea concurso
3. Si `estado != resolucion_a_la_firma` → marca el `Cargo` como `no_vigente`
4. Si `generaConcurso: true` → llama a `createConcursoTx(tx, body, usuarioId, bajaId)`

`updateBajaService(id, body, usuarioId)` — solo edita bajas en `resolucion_a_la_firma`. Recibe `usuarioId` para pasarlo a `createConcursoTx` al confirmar.

### Campos de la tabla `bajas`

| Campo | Descripción |
|---|---|
| `ee_baja` | Expediente electrónico de la baja |
| `partida_presupuestaria` | Partida presupuestaria del cargo |
| `doc_respaldatoria` | Documento respaldatorio |
| `fecha_pase_paralelo` | Fecha de pase paralelo / GT |
| `estado` | `resolucion_a_la_firma` \| `pendiente` \| `confirmada` \| `anulada` |

---

## Módulo Concursos CPH — estado calculado y autorizaciones

`calcConcursoCph()` calcula `estado`, `subEstado` (19 niveles) y `subEstado3` (8 niveles) server-side en cada create/PATCH. El schema Zod del PATCH usa `.strict()` — no acepta `estado`/`subEstado`/`subEstado3` en el body.

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

| Campo | Tipo | Descripción |
|---|---|---|
| `pendiente_autorizacion` | BOOLEAN default false | Hay una modificación pendiente de aprobación |
| `sigla_solicitada` | VARCHAR nullable | Nueva sigla solicitada (dispara flujo Director → SGRASV) |
| `codigo_registro_solicitado_id` | UUID FK nullable | Nuevo código de registro solicitado (ídem) |
| `aprobado_director` | BOOLEAN default false | El Director ya aprobó el cambio de sigla/CR |

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
