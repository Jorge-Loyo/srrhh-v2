# SRRHH v2

Sistema de Recursos Humanos — Gobierno de la Ciudad de Buenos Aires

## Stack

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 16 |
| ORM | Prisma |
| Backend | Node.js + TypeScript + Fastify |
| Frontend | React + TypeScript + Vite + Tailwind |
| Estado servidor | TanStack Query |
| Diseño | Obelisco v2 (GCBA) |
| Monorepo | pnpm workspaces + Turborepo |

## Estructura

```
srrhh-v2/
├── apps/
│   ├── api/          ← Backend Fastify
│   └── web/          ← Frontend React
├── packages/
│   ├── types/        ← DTOs y enums compartidos
│   └── utils/        ← Helpers compartidos
├── prisma/           ← Schema de BD
├── Doc/              ← Documentación y contratos
└── docker-compose.yml
```

## Requisitos

- Node.js >= 20
- pnpm >= 9
- Docker (para PostgreSQL)

## Setup

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar PostgreSQL
docker-compose up -d postgres

# 3. Copiar variables de entorno
cp .env.example .env

# 4. Ejecutar migraciones
pnpm db:migrate

# 5. Iniciar desarrollo
pnpm dev
```

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` | Inicia API y Web en modo desarrollo |
| `pnpm build` | Build de producción |
| `pnpm db:migrate` | Ejecuta migraciones Prisma |
| `pnpm db:studio` | Abre Prisma Studio |
| `pnpm lint` | Ejecuta linter en todos los packages |

## Documentación

Ver carpeta `Doc/`:
- `Contrato_Tecnologias.md` — Stack y decisiones técnicas
- `Contrato_Datos.md` — Modelo de datos y esquema
- `Contrato_Back.md` — Arquitectura del backend
- `Contrato_front.md` — Arquitectura del frontend
- `Contrato_Diseño.md` — Sistema visual Obelisco GCBA

## Licencia

Uso interno — Gobierno de la Ciudad de Buenos Aires
