# CONTRATO DE REPOSITORIOS Y RAMAS

> Fuente de verdad para la gestión de repositorios del proyecto SRRHH v2.
> Última actualización: 2026-08-31

---

## REPOSITORIOS

| Remote  | URL                                              | Propósito                          |
| ------- | ------------------------------------------------ | ---------------------------------- |
| `origin` | https://github.com/SRRHH-GCBA/srrhh-v2.git     | **Desarrollo** — fuente de verdad  |
| `deploy` | https://github.com/Jorge-Loyo/srrhh-v2.git     | **Testing/Producción** — solo push cuando se quiere hacer testing manual con Vercel + Render + Neon |

### Regla fundamental

`origin` (SRRHH-GCBA) y `deploy` (Jorge-Loyo) son **repositorios independientes que nunca se sincronizan entre sí de forma automática**. El flujo es unidireccional y manual:

```
SRRHH-GCBA (desarrollo) ──── push manual ────► Jorge-Loyo (deploy/testing)
```

- **Nunca** hacer `git pull deploy` ni mergear cambios de `Jorge-Loyo` hacia `SRRHH-GCBA`.
- **Nunca** apuntar `origin` a `Jorge-Loyo` para trabajo de desarrollo.
- El remote `deploy` existe solo para poder hacer push cuando se quiere actualizar el entorno de testing.

---

## RAMAS EN `origin` (SRRHH-GCBA)

| Rama       | Propósito                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| `main`     | Código estable, mergeado y revisado. Base de cada sprint cerrado.         |
| `develop`  | Integración continua. Se mergea a `main` al cerrar un sprint.             |
| `jorge`    | Rama de trabajo de Jorge (backend, schema, infra).                        |
| `Agustin`  | Rama de trabajo de Agustín (frontend, UI).                                |
| `deploy`   | Rama auxiliar — no usar para desarrollo.                                  |

### Flujo de trabajo

```
jorge / Agustin ──► develop ──► main
```

1. Cada dev trabaja en su rama (`jorge` o `Agustin`).
2. Al terminar una tarea se mergea a `develop`.
3. Al cerrar un sprint se mergea `develop` → `main`.
4. **Nunca** pushear directamente a `main` sin pasar por `develop`.

---

## ENTORNO DE DEPLOY (Jorge-Loyo)

El repositorio `Jorge-Loyo/srrhh-v2` conecta con:

| Servicio | Plataforma | URL                                      |
| -------- | ---------- | ---------------------------------------- |
| Frontend | Vercel     | https://web-pied-rho-26.vercel.app       |
| API      | Render     | https://srrhh-v2.onrender.com            |
| Base de datos | Neon  | ep-aged-water-aenv5cc4-pooler (neondb)   |

### Cuándo pushear a `deploy`

Solo cuando se quiere que el equipo haga **testing manual** del estado actual de desarrollo. El proceso es:

```bash
# Desde la rama main de SRRHH-GCBA, pushear al repo de deploy
git push deploy main
```

Esto triggerea un redeploy automático en Vercel y Render.

### Archivos exclusivos de `deploy` (no deben existir en `origin`)

- `render.yaml`
- `vercel.json`
- `start.sh`
- Cambios en `apps/api/tsconfig.json` (strict: false, Node16)
- Cambios en `apps/web/tsconfig.json` (strict: false)
- Cambios en `package.json` (engines.node, prisma en dependencies)
- Cambios en `packages/types/tsconfig.json`

---

## CONFIGURACIÓN LOCAL DEL REPO

El repo local debe tener siempre estos remotes:

```bash
git remote -v
# origin   https://github.com/SRRHH-GCBA/srrhh-v2.git (fetch)
# origin   https://github.com/SRRHH-GCBA/srrhh-v2.git (push)
# deploy   https://github.com/Jorge-Loyo/srrhh-v2.git (fetch)
# deploy   https://github.com/Jorge-Loyo/srrhh-v2.git (push)
```

Si en algún momento `origin` apunta a `Jorge-Loyo`, corregir con:

```bash
git remote set-url origin https://github.com/SRRHH-GCBA/srrhh-v2.git
```

---

## ENTORNO LOCAL DE DESARROLLO

El desarrollo local usa Docker Compose con:

- **Postgres 16** en `localhost:5432` (contenedor `srrhh_postgres`)
- **API** en `localhost:3000` (contenedor `srrhh_api`)
- **Dotaneitor** en `localhost:5001` (contenedor `srrhh_dotaneitor`)
- **Frontend** en `localhost:5173` (Vite dev server, fuera de Docker)

Variables de entorno locales en `apps/api/.env` — nunca commitear credenciales reales.
