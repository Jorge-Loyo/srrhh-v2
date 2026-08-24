# Contrato de Backend — SRRHH v2

> Define la arquitectura, estructura, convenciones y reglas del servidor.
> Última actualización: 2026-09
> Estado: BORRADOR — en revisión

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
│   │   │   ├── auth.schema.ts    ← Zod schemas de validación
│   │   │   └── auth.types.ts
│   │   ├── personas/
│   │   ├── cargos/
│   │   ├── ocupaciones/
│   │   ├── padron/           ← Snapshots, diff, validación
│   │   ├── concursos-cph/
│   │   ├── concursos-ceetps/
│   │   ├── bajas/
│   │   ├── hospitales/
│   │   └── usuarios/
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts     ← Verificación JWT
│   │   │   ├── roles.middleware.ts    ← Control de acceso por rol
│   │   │   └── audit.middleware.ts    ← Log automático de escrituras
│   │   ├── errors/
│   │   │   ├── AppError.ts            ← Clase base de errores
│   │   │   └── error.handler.ts       ← Handler global de errores
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

### Ejemplos

```
GET    /api/v1/personas
GET    /api/v1/personas/:id
POST   /api/v1/personas
PATCH  /api/v1/personas/:id

GET    /api/v1/padron/snapshots
POST   /api/v1/padron/upload
GET    /api/v1/padron/snapshots/:id/diff
POST   /api/v1/padron/snapshots/:id/aprobar
POST   /api/v1/padron/snapshots/:id/rechazar

GET    /api/v1/concursos-cph
GET    /api/v1/concursos-cph/:id
PATCH  /api/v1/concursos-cph/:id
POST   /api/v1/concursos-cph/:id/suspender

GET    /api/v1/kpis/dotacion
GET    /api/v1/kpis/concursos
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
| `CONFLICT` | 409 | Conflicto (ej: CUIL duplicado) |
| `SNAPSHOT_PENDIENTE` | 409 | Hay un snapshot pendiente de aprobación |
| `INTERNAL_ERROR` | 500 | Error interno del servidor |

---

## Autenticación y autorización

### Flujo de autenticación

```
POST /api/v1/auth/login
  → valida credenciales
  → devuelve { accessToken (15min), refreshToken (7 días) }

POST /api/v1/auth/refresh
  → valida refreshToken
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
| `viewer` | Solo lectura |
| `director` | Solo lectura de su hospital |
| `concursales_cph` | Lectura total + escritura en concursos CPH y bajas |
| `concursales_ceetps` | Lectura total + escritura en concursos CEETPS y bajas |

### Middleware de roles

```typescript
// Uso en rutas
fastify.patch('/concursos-cph/:id',
  { preHandler: [authenticate, requireRole(['admin', 'editor', 'concursales_cph'])] },
  handler
)
```

---

## Paginación

Todas las listas son paginadas. Parámetros estándar:

```
GET /api/v1/personas?page=1&limit=50&search=garcia&hospital=HGACA&escalafon=CPH
```

- `page`: número de página (default: 1)
- `limit`: registros por página (default: 50, máximo: 200)
- `search`: búsqueda de texto libre (aplica full-text search en PostgreSQL)
- Filtros específicos por módulo como query params adicionales

---

## Módulo Padrón — flujo detallado

```
1. POST /api/v1/padron/upload
   - Recibe el archivo Excel (multipart)
   - Crea padron_snapshots con estado: pendiente
   - Envía el archivo al microservicio Python para procesamiento
   - Devuelve { snapshot_id, job_id }

2. GET /api/v1/padron/jobs/:job_id
   - Polling del estado del procesamiento Python
   - Devuelve { status: pending | done | error, progress }

3. GET /api/v1/padron/snapshots/:id/diff
   - Devuelve el diff calculado (paginado)
   - { nuevos: [...], modificados: [...], eliminados: [...], totales: {...} }

4. POST /api/v1/padron/snapshots/:id/aprobar
   - Valida que el snapshot esté en estado pendiente
   - Aplica los cambios: actualiza ocupaciones, personas, cargos
   - Inserta en padron_historico
   - Cambia estado a aprobado
   - Registra en audit_logs

5. POST /api/v1/padron/snapshots/:id/rechazar
   - Cambia estado a rechazado
   - Libera el bloqueo para nuevas cargas
```

---

## Microservicio Python (Dotaneitor)

El microservicio Python se mantiene separado. El backend Node actúa como proxy/orquestador.

```
Node API  →  POST http://python-service:5001/session
          →  POST http://python-service:5001/upload-cargos
          →  POST http://python-service:5001/normalizar
          →  POST http://python-service:5001/procesar
          →  POST http://python-service:5001/cruzar
          →  POST http://python-service:5001/diff
          ←  devuelve diff calculado
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
Cada operación de escritura loguea: usuario, acción, entidad, ID afectado.

---

## Reglas que no se negocian

1. **Validación con Zod en cada endpoint** — ningún dato llega al service sin ser validado.
2. **Sin lógica en las rutas** — las rutas solo validan, llaman al service y devuelven la respuesta.
3. **Sin Prisma fuera de los services** — las rutas no hacen queries directas.
4. **Errores tipados** — todos los errores extienden `AppError`. Sin `throw new Error('string')` sueltos.
5. **Audit log automático** — el middleware de auditoría registra toda escritura sin que el developer tenga que acordarse.
6. **TypeScript estricto** — `strict: true`. Sin `any` salvo casos excepcionales con comentario justificando.
7. **Variables de entorno validadas** — el servidor no arranca si falta una variable requerida.
