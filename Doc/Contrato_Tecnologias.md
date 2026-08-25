# Contrato de Tecnologías — SRRHH v2

> Documento de decisiones técnicas. Toda elección de stack está justificada por los requerimientos del dominio.
> Última actualización: 2026-09
> Estado: APROBADO — no modificar sin consenso del equipo

---

## Contexto que guió las decisiones

| Parámetro | Valor |
|---|---|
| Registros activos | ~48.000 (padrón semanal) |
| Crecimiento histórico | ~2.5M filas/año (52 semanas × 48k) |
| Usuarios concurrentes pico | 100 |
| Tipo de carga | Lectura analítica (KPIs, reportes) + escritura batch semanal |
| Búsquedas | Por nombre, DNI, CUIL, SIAL, hospital, cargo (múltiples campos) |
| Plataformas | Web desktop + mobile (responsive) |
| Equipo | 2 desarrolladores |
| Infraestructura inicial | Local → VPS propio en la nube |

---

## Stack definitivo

| Capa | Tecnología | Versión mínima |
|---|---|---|
| Base de datos | PostgreSQL | 16 |
| ORM / Migraciones | Prisma | 5.x |
| Backend | Node.js + TypeScript + Fastify | Node 20 LTS |
| Frontend | React + TypeScript + Vite + Tailwind CSS | React 18, Vite 5 |
| Estado servidor (frontend) | TanStack Query | v5 |
| Componentes UI | shadcn/ui | latest |
| Formularios | React Hook Form + Zod | — |
| Routing frontend | React Router | v7 |
| Procesamiento Excel (Dotaneitor) | Python + FastAPI | Python 3.11+ |
| Monorepo | pnpm workspaces + Turborepo | pnpm 9 |
| Contenedores | Docker + docker-compose | — |
| Control de versiones | GitHub (organización) | — |
| CI/CD | GitHub Actions | — |

---

## Decisiones y justificaciones

### Base de datos: PostgreSQL sobre MySQL

**Motivo principal:** el histórico de cambios del padrón va a crecer a millones de filas.
PostgreSQL ofrece:
- Particionado nativo por rango de fecha — la tabla de histórico se particiona por año/mes sin cambiar queries
- `tsvector` + índices GIN para búsqueda de texto completo nativa (nombre, cargo, hospital)
- JSONB indexable para datos semiestructurados si aparecen en el futuro
- Window functions completas para KPIs comparativos entre períodos

**NoSQL descartado:** todo el dominio es relacional (persona → cargo → hospital → concurso → baja). Agregar MongoDB o similar solo agregaría complejidad sin beneficio.

**Redis (futuro):** puede agregarse como cache de KPIs pesados en una segunda fase. No en el arranque.

---

### Backend: Fastify sobre Express

**Motivo:** Fastify es 2-3x más rápido en throughput que Express, tiene validación de schemas integrada con JSON Schema, y soporte TypeScript de primera clase. Con 100 usuarios concurrentes y queries analíticas, el performance del servidor importa.

**Python:** el microservicio Dotaneitor (procesamiento de Excel) se mantiene en Python + FastAPI. Esa lógica es compleja, ya funciona, y Python es el lenguaje correcto para procesamiento de datos con pandas. No se reescribe.

---

### ORM: Prisma

**Motivo:** el schema de Prisma es la fuente de verdad de la base de datos. Genera:
- Tipos TypeScript automáticamente → imposible escribir una query con una columna que no existe
- Migraciones versionadas desde el día 1 → historial completo de cambios de esquema
- Cliente con autocompletado completo en el IDE

**Regla:** ningún cambio de esquema se hace directamente en la BD. Todo pasa por una migración Prisma.

---

### Frontend: TanStack Query

**Motivo:** reemplaza el patrón manual de `useState(loading) + useEffect(fetch) + useState(error)` que genera el 60% del código boilerplate. TanStack Query maneja cache, revalidación, estados de carga y error, y sincronización automática.

**Regla:** ningún fetch al backend se hace con `useEffect` directo. Todo pasa por un hook de TanStack Query.

---

### Componentes UI: shadcn/ui

**Motivo:** no es una librería de componentes — es un conjunto de componentes que se copian al proyecto. Sin dependencia externa, sin conflictos de versiones, 100% customizables. Construidos sobre Radix UI (accesibilidad) y Tailwind.

**Regla:** antes de crear un componente custom, verificar si shadcn/ui ya lo tiene.

---

### Monorepo: pnpm workspaces + Turborepo

**Motivo:** con dos devs trabajando en front y back simultáneamente, el monorepo permite:
- Tipos compartidos entre front y back como código (no como documentación)
- Un solo repositorio, un solo CI/CD
- Turborepo construye solo lo que cambió, en paralelo

---

### Infraestructura: Docker desde el día 1

**Motivo:** aunque corran local ahora, tener `docker-compose.yml` desde el inicio garantiza que el deploy a VPS sea trivial. El entorno de desarrollo es idéntico al de producción.

---

## Lo que NO se usa y por qué

| Tecnología | Motivo de descarte |
|---|---|
| MongoDB / NoSQL | Dominio 100% relacional, no hay beneficio |
| GraphQL | Overhead innecesario para este equipo y dominio |
| Next.js | SSR no requerido, agrega complejidad sin beneficio para una app interna |
| Nest.js | Demasiado opinionado, curva alta, Fastify es suficiente |
| Sequelize / TypeORM | Prisma es superior en DX y type safety |
| Redux | TanStack Query cubre el estado servidor; Zustand/Context para estado local si hace falta |

---

## Estructura del monorepo

```
srh-v2/
├── apps/
│   ├── api/                ← Fastify + Prisma (backend)
│   └── web/                ← React + Vite (frontend)
├── packages/
│   ├── types/              ← DTOs y enums compartidos entre api y web
│   └── utils/              ← Helpers compartidos (fechas, formateo, etc.)
├── prisma/
│   ├── schema.prisma       ← Fuente de verdad del esquema de BD
│   └── migrations/         ← Historial de migraciones
├── docker-compose.yml      ← PostgreSQL + API + Web para desarrollo local
├── pnpm-workspace.yaml
├── turbo.json
└── .github/
    └── workflows/          ← CI/CD pipelines
```

---

## Organización en GitHub

- Una organización para el proyecto (no repo personal)
- Ramas: `main` (producción), `develop` (integración), feature branches por tarea
- Pull Requests obligatorios para mergear a `develop` y `main`
- Branch protection en `main`: requiere PR + review

> ⚠️ **Limitación conocida (2026-08-25):** la regla de branch protection en `main`
> está creada en GitHub (`Settings → Branches`) pero **no se hace cumplir** —
> GitHub Free para organizaciones no aplica branch protection en repos
> privados, hace falta plan Team o Enterprise. Hoy esto es un acuerdo de
> proceso (PR + review antes de mergear a `main`), no un bloqueo técnico: un
> push directo a `main` todavía es posible. Si la organización pasa a un plan
> pago, la regla ya existente empieza a aplicarse sola, sin reconfigurar nada.

---

## Reglas que no se negocian

1. **TypeScript estricto** — `strict: true` en `tsconfig.json`. Sin `any` salvo casos excepcionales documentados.
2. **Migraciones versionadas** — ningún `ALTER TABLE` manual en producción.
3. **Contratos de datos** — los tipos del paquete `packages/types` son la interfaz entre front y back. Si cambia un DTO, cambia en un solo lugar.
4. **Docker para todo** — ningún servicio corre "a mano" en producción.
5. **Variables de entorno** — ninguna credencial en el código. Todo en `.env` con `.env.example` documentado.
