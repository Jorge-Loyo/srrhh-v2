# SRRHH v2 — Sistema de Recursos Humanos GCBA

Monorepo pnpm + Turborepo. Stack: Fastify 5 + Prisma + PostgreSQL (backend), React 18 + Vite + Tailwind con tokens Obelisco GCBA (frontend).

## Requisitos

- Node 20+
- pnpm 9+
- Docker + Docker Compose

## Setup inicial

```bash
# 1. Clonar
git clone https://github.com/SRRHH-GCBA/srrhh-v2.git
cd srrhh-v2

# 2. Instalar dependencias
pnpm install

# 3. Variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Editar apps/api/.env con los valores reales (pedir a Jorge)

# 4. Levantar PostgreSQL
docker compose up postgres -d

# 5. Aplicar migraciones y seed
pnpm db:migrate
pnpm db:seed

# 6. Levantar todo
pnpm dev
```

## URLs locales

| Servicio | URL |
| -------- | --- |
| API | http://localhost:3000 |
| Web | http://localhost:5173 |
| Health | http://localhost:3000/health |

## Comandos útiles

```bash
pnpm dev              # Levanta API + Web en paralelo
pnpm db:migrate       # Aplica migraciones pendientes
pnpm db:seed          # Carga datos iniciales (hospitales, escalafones, admin)
pnpm db:studio        # Abre Prisma Studio
pnpm build            # Build de producción
```

## Usuario admin por defecto

| Campo | Valor |
| ----- | ----- |
| Usuario | `admin` |
| Contraseña | `Admin1234!` |

## Estructura

```
srrhh-v2/
├── apps/api/          ← Fastify + Prisma + PostgreSQL
├── apps/web/          ← React + Vite + Tailwind (tokens Obelisco GCBA)
├── packages/types/    ← DTOs y enums compartidos
├── packages/utils/    ← Helpers compartidos
├── prisma/            ← Schema + migraciones + seed
├── services/
│   └── dotaneitor/    ← Microservicio Python (análisis padrón)
└── docker-compose.yml
```

## Planificación

Ver `Doc/Planificacion/PLAN_SCRUM_2026.md`
