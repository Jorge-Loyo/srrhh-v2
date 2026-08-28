# Contrato de Backend — SRRHH v2

> Define la arquitectura, estructura, convenciones y reglas del servidor.
> Última actualización: 2026-09 (Post-Sprint 5)
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
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.schema.ts
│   │   ├── personas/
│   │   ├── cargos/
│   │   ├── ocupaciones/
│   │   ├── padron/           ← Snapshots, diff, validación
│   │   ├── concursos/        ← Módulo padre: POST /concursos
│   │   ├── concursos-cph/
│   │   ├── concursos-ceetps/
│   │   ├── bajas/
│   │   ├── kpis/
│   │   ├── hospitales/
│   │   ├── escalafones/
│   │   └── usuarios/
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts     ← Verificación JWT
│   │   │   ├── roles.middleware.ts    ← Control de acceso por rol
│   │   │   └── audit.middleware.ts    ← Log automático de escrituras (onResponse)
│   │   ├── errors/
│   │   │   ├── AppError.ts            ← Clase base de errores
│   │   │   └── error.handler.ts       ← Handler global de errores
│   │   ├── codigoCargo.ts             ← prefijoDeCargo() + siguienteCodigoCargo()
│   │   ├── prisma.ts                  ← Cliente Prisma singleton
│   │   └── logger.ts                  ← Logger estructurado (pino)
│   ├── config/
│   │   └── env.ts                     ← Variables de entorno validadas con Zod
│   └── app.ts                         ← Instancia Fastify + plugins + rutas
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── Dockerfile
├── tsconfig.json
└── package.json
```

---

## Arquitectura por módulo

Cada módulo sigue el mismo patrón de 3 capas:

```
routes.ts  →  service.ts  →  prisma (DB)
    │               │
    │         (lógica de negocio)
    │
  Zod schema valida el request antes de llegar al service
```

**Regla:** las rutas no tienen lógica de negocio. Los services no conocen HTTP (no usan `request`/`reply`). Prisma solo se usa dentro de los services.

---

## Convenciones de endpoints

### Estructura de URLs

```
/api/v1/{recurso}               GET (lista), POST (crear)
/api/v1/{recurso}/:id           GET (detalle), PATCH (actualizar), DELETE (soft delete)
/api/v1/{recurso}/:id/{accion}  POST para acciones específicas
```

### Endpoints implementados

```
# Auth
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Catálogos
GET    /api/v1/hospitales
GET    /api/v1/escalafones          ← solo los que tienen cargos reales
GET    /api/v1/puestos              ← puestos distintos de cargos (con ?escalafonId)
GET    /api/v1/cargos/puestos       ← alias con filtros escalafonId + hospitalId

# Personas
GET    /api/v1/personas             ← full-text search + filtros
GET    /api/v1/personas/:id

# Cargos
GET    /api/v1/cargos               ← filtros + búsqueda unaccent
GET    /api/v1/cargos/:id
POST   /api/v1/cargos               ← Alta manual (ADMIN, EDITOR)

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

# Concursos CEETPS
GET    /api/v1/concursos-ceetps
GET    /api/v1/concursos-ceetps/:id
PATCH  /api/v1/concursos-ceetps/:id

# Bajas
GET    /api/v1/bajas
POST   /api/v1/bajas

# KPIs
GET    /api/v1/kpis/concursos-cph
GET    /api/v1/kpis/concursos-ceetps

# Usuarios (admin)
GET    /api/v1/usuarios
POST   /api/v1/usuarios
PATCH  /api/v1/usuarios/:id
```

### Formato de respuesta

Todas las respuestas siguen el mismo envelope:

```typescript
// Éxito con datos
{
  "data": { ... } | [ ... ],
  "meta": {           // solo en listas paginadas
    "total": 1250,
    "page": 1,
    "limit": 50,
    "pages": 25
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El campo cuil es requerido",
    "details": [ ... ]   // opcional, para errores de validación
  }
}
```

### Códigos de error estándar

| Code | HTTP | Descripción |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request inválido |
| `UNAUTHORIZED` | 401 | Sin token o token inválido |
| `FORBIDDEN` | 403 | Sin permisos para esta acción |
| `NOT_FOUND` | 404 | Recurso no encontrado |
| `CONFLICT` | 409 | Conflicto (ej: CUIL duplicado, concurso abierto duplicado) |
| `SNAPSHOT_PENDIENTE` | 409 | Hay un snapshot pendiente de aprobación |
| `INTERNAL_ERROR` | 500 | Error interno del servidor |

---

## Autenticación y autorización

### Flujo de autenticación

```
POST /api/v1/auth/login
  → valida credenciales (siempre corre bcrypt, incluso si el usuario no existe)
  → devuelve { accessToken (15min), refreshToken (7 días) }

POST /api/v1/auth/refresh
  → updateMany WHERE revocado = false (atómico — evita race condition)
  → rota el token (invalida el anterior, emite uno nuevo)
  → si se detecta reutilización de token revocado → invalida toda la familia

POST /api/v1/auth/logout
  → revoca el refreshToken actual
```

### Roles y permisos

| Rol | Acceso |
|---|---|
| `admin` | Todo |
| `editor` | Lectura + escritura en todos los módulos |
| `viewer` | Solo lectura (todos los módulos) |
| `director` | Solo lectura (todos los módulos) |
| `concursales_cph` | Lectura total + escritura en concursos CPH y bajas |
| `concursales_ceetps` | Lectura total + escritura en concursos CEETPS y bajas |

**Nota:** `director` y `viewer` tienen el mismo acceso de lectura total en la implementación actual. El filtrado por hospital para `director` es una mejora pendiente de backlog.

### Middleware de roles

```typescript
// Uso en rutas
fastify.patch('/concursos-cph/:id',
  { preHandler: [authenticate, requireRole(['admin', 'editor', 'concursales_cph'])] },
  handler
)
```

### Validación de tipo de concurso por rol

`concursales_ceetps` recibe 403 si intenta crear un concurso CPH, y viceversa. `admin`/`editor` pueden crear cualquier tipo.

---

## Paginación

Todas las listas son paginadas. Parámetros estándar:

```
GET /api/v1/personas?page=1&limit=50&search=garcia&hospitalId=...&escalafonId=...
```

- `page`: número de página (default: 1)
- `limit`: registros por página (default: 50, máximo: 200)
- `search`: búsqueda de texto libre — usa `unaccent` + `to_tsquery` con prefijos (`:*`) para búsqueda parcial sin acentos
- Filtros específicos por módulo como query params adicionales

---

## Módulo Padrón — flujo detallado

```
1. POST /api/v1/padron/upload
   - Recibe el archivo Excel (multipart) — el buffer se resuelve inline en el loop
   - Crea padron_snapshots con estado: procesando
   - Dispara el pipeline en background (async, devuelve 202 inmediato)
   - Devuelve { snapshotId }

2. GET /api/v1/padron/snapshots/:id/estado
   - Polling del estado: procesando | pendiente | aprobado | rechazado | error
   - Devuelve { estado, pasoActual, errorMsg }

3. GET /api/v1/padron/snapshots/:id/diff
   - Devuelve el diff calculado (paginado)
   - { nuevos: [...], modificados: [...], eliminados: [...], totales: {...} }

4. POST /api/v1/padron/snapshots/:id/aprobar
   - Valida que el snapshot esté en estado pendiente
   - Aplica los cambios en lotes (createMany troceado en lotes de 2000)
   - Genera Cargo.codigo automáticamente para cargos nuevos
   - Inserta en padron_historico
   - Cambia estado a aprobado
   - Registra en audit_logs

5. POST /api/v1/padron/snapshots/:id/rechazar
   - Cambia estado a rechazado
   - Libera el bloqueo para nuevas cargas
```

---

## Módulo Cargos — generación de código

`shared/codigoCargo.ts` expone dos funciones:

- `prefijoDeCargo(escalafon, unificadorPuesto, agrupador)` — mapea al prefijo correcto según `REGLAS_NEGOCIO.MD §3` del sistema legacy. Prefijos implementados: `CPH-POF`, `CPH-POU`, `CPH-J-POF`, `CPH-J-POU`, `CPH-D`, `CPH-SD`, `ENF`, `TEC-POF`, `TEC-POU`, `EG`, `EG-J`, `EG-D`, `EG-G`, `AS-MIN`, `AS-SS`, `AS-DG`, `AS-DGA`, `RG-CG`, `SG`, `RES`, `DOC`, `PT`, `CT`, `PG`
- `siguienteCodigoCargo(tx, prefijo)` — secuencial atómico dentro de la transacción del llamador

Se usa en:
- `aprobarSnapshotService` — al crear cargos nuevos desde el padrón
- `createCargoService` — al dar de alta un cargo manualmente (`POST /api/v1/cargos`)

---

## Módulo Bajas — flujo

`createBajaService` ejecuta una sola transacción que:
1. Crea la `Baja`
2. Marca el `Cargo` como `no_vigente`
3. Si `generaConcurso: true` → llama a `createConcursoTx(tx, body, usuarioId, bajaId)` para crear el seguimiento concursal vinculado

`createConcursoTx` es una función pública en `concursos.service.ts` que acepta un `tx` externo — permite llamarla desde `createBajaService` sin anidar `$transaction`.

---

## Módulo Concursos CPH — estado calculado

`calcConcursoCph()` en `concursosCph.calc.ts` calcula `estado`, `subEstado` (19 niveles) y `subEstado3` (8 niveles) server-side en cada create/PATCH/suspender. El schema Zod del PATCH usa `.strict()` — no acepta `estado`/`subEstado`/`subEstado3` en el body.

`subEstado3` tiene dos ramas que dependen de la fecha actual, por lo que el listado y los KPIs lo recalculan en SQL (`SUB_ESTADO_3_SQL_PG`) en vez de confiar en el valor persistido.

---

## Microservicio Python (Dotaneitor)

El microservicio Python se mantiene separado. El backend Node actúa como proxy/orquestador.

```
Node API  →  POST http://python-service:5001/session
          →  POST http://python-service:5001/upload-cargos
          →  POST http://python-service:5001/normalizar
          →  POST http://python-service:5001/procesar
          →  POST http://python-service:5001/cruzar
          ←  devuelve preview del diff
Node API calcula el diff comparando contra Cargo+Ocupacion en Postgres
Node API guarda el diff en padron_diff y gestiona la aprobación
```

**Regla:** el frontend nunca habla directamente con el servicio Python. Todo pasa por la API Node.

---

## Variables de entorno

Todas las variables se validan con Zod al arrancar. Si falta una variable requerida, el servidor no arranca.

```bash
# Base de datos
DATABASE_URL="postgresql://user:pass@localhost:5432/srrhh"

# Auth
JWT_SECRET="..."
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"

# Microservicio Python
PYTHON_SERVICE_URL="http://localhost:5001"

# Servidor
PORT=3000
NODE_ENV="development"
CORS_ORIGINS="http://localhost:5173"

# Logs
LOG_LEVEL="info"
```

---

## Logging

Se usa `pino` (incluido en Fastify) con formato estructurado JSON en producción.

Cada request loguea automáticamente: método, URL, status, tiempo de respuesta.
El middleware de auditoría corre en `onResponse` (no en `preHandler`) para garantizar que `request.user` esté poblado cuando se registra la escritura.

---

## Reglas que no se negocian

1. **Validación con Zod en cada endpoint** — ningún dato llega al service sin ser validado.
2. **Sin lógica en las rutas** — las rutas solo validan, llaman al service y devuelven la respuesta.
3. **Sin Prisma fuera de los services** — las rutas no hacen queries directas.
4. **Errores tipados** — todos los errores extienden `AppError`. Sin `throw new Error('string')` sueltos.
5. **Audit log en `onResponse`** — el middleware registra toda escritura sin que el developer tenga que acordarse. Corre en `onResponse`, no en `preHandler`.
6. **TypeScript estricto** — `strict: true`. Sin `any` salvo casos excepcionales con comentario justificando.
7. **Variables de entorno validadas** — el servidor no arranca si falta una variable requerida.
8. **Estado calculado server-side** — `estado`/`subEstado` de concursos no son editables por el cliente. El schema Zod del PATCH usa `.strict()` para rechazarlos.
9. **Schemas PATCH con `.strict()`** — ningún campo calculado puede colarse por el body.
