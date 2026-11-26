# SRRHH v2 — Sistema de Recursos Humanos GCBA

Monorepo pnpm + Turborepo. Stack: Fastify 5 + Prisma + PostgreSQL (backend), React 18 + Vite + Tailwind con tokens Obelisco GCBA (frontend).

## Requisitos

- Node 20+
- pnpm 9+
- Docker + Docker Compose

## Arranque local

### 1. Frontend (siempre igual, independiente de la BD)

```bash
# Desde WSL
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy/apps/web
npx vite --port 5180
# → http://localhost:5180
```

### 2. API — elegir a qué BD apuntar

#### Producción (`srrhh-sync` / `ep-little-river`)
```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose up -d api
```

#### Laboratorio — branch Neon con datos reales para pruebas (`ep-crimson-band`)
```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.laboratorio.yml up -d api
```

#### Reestructuración BD (`Neon_BD` / `ep-rough-pond`)
```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.neonbd.yml up -d api
```

#### BD local PostgreSQL (sin Neon)
```bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.localdb.yml up -d api
```

### 3. Verificar que levantó

```bash
curl http://localhost:3000/health
# Verificar a qué branch Neon apunta:
docker exec srrhh_api node -e "const u=process.env.DATABASE_URL;console.log(u?.match(/ep-[a-z0-9-]+/)?.[0])"
```

### 4. Rebuild del API (después de cambios en el código)

```bash
# Producción
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose build api && docker compose up -d api

# Laboratorio
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
docker compose -f docker-compose.yml -f docker-compose.laboratorio.yml build api && \
docker compose -f docker-compose.yml -f docker-compose.laboratorio.yml up -d api
```

### Mapa de branches Neon

| Entorno | Branch Neon | Override |
|---|---|---|
| Producción | `srrhh-sync` (`ep-little-river`) | ninguno |
| Laboratorio | `laboratorio` (`ep-crimson-band`) | `docker-compose.laboratorio.yml` |
| Reestructuración | `Neon_BD` (`ep-rough-pond`) | `docker-compose.neonbd.yml` |
| Local | PostgreSQL en Docker | `docker-compose.localdb.yml` |

---

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

Gestión de tareas en [Notion](https://app.notion.com/p/42d483af08924aef9d4fcb102fc72756?v=7f5beedb27ed4251a8c790a1d20c6841&source=copy_link)
