# Deploy de producción — S6-7

> Borrador armado el 2026-08-31 sin acceso a los datos reales del servidor de destino.
> Las 3 imágenes Docker (api, web, y el Caddyfile) están **verificadas** — no es solo
> teoría, se construyeron y se corrieron de verdad contra la base de datos local. Lo
> que falta es específico del servidor real: dominio, contraseñas, y decidir si hay
> algo más corriendo en ese servidor que compita por los puertos 80/443.

---

## 1. Qué es cada archivo nuevo

| Archivo | Para qué |
|---|---|
| `docker-compose.prod.yml` | Stack completo de producción: postgres + api + dotaneitor + web + caddy |
| `apps/api/Dockerfile.prod` | Build multi-stage de la API — corre el JS ya compilado (`tsc`), no `tsx watch` como el de dev |
| `apps/web/Dockerfile.prod` | Build multi-stage del frontend — bundle estático de Vite servido por nginx |
| `apps/web/nginx.prod.conf` | Config de nginx con fallback de SPA (`try_files ... /index.html`), si no cualquier F5 en una ruta que no sea `/` tira 404 |
| `Caddyfile` | Reverse proxy + TLS automático (Let's Encrypt) — enruta `/api/*` y `/health` a la API, el resto al frontend |
| `.env.production.example` | Plantilla de las variables que hay que completar — copiar a `.env.production` (gitignoreado) |

## 2. Diferencias clave contra dev (`docker-compose.yml`)

- **Nada expone puertos al host salvo Caddy** (80/443). Ni Postgres, ni la API, ni
  Dotaneitor son alcanzables desde afuera del stack — todo pasa por el proxy.
- **Secrets vía `.env.production`**, no hardcodeados en el YAML como en dev
  (`srrhh_pass`, `dev-secret-minimo-32-caracteres-cambiar`).
- **API corre compilada**: `Dockerfile.prod` hace `tsc` en el build y corre
  `dist/app.js` — con una salvedad, ver punto 4.
- **Web es un build estático** servido por nginx, no Vite nativo en Windows (eso es
  solo para desarrollo local, ver `Doc/ARRANQUE_LOCAL.md`).

## 3. Qué se verificó de verdad (no es solo "debería andar")

Corrido a mano contra Docker (WSL2) el 2026-08-31:

1. `docker build -f apps/api/Dockerfile.prod .` — build exitoso, `tsc` sin errores.
2. Container de la API levantado standalone en la red del stack de dev, contra la
   Postgres real → `/health` responde 200 y `POST /auth/login` devuelve un token
   válido contra el usuario admin real.
3. `docker build -f apps/web/Dockerfile.prod .` — build exitoso, bundle de Vite
   generado (`840 KB` sin comprimir — hay una advertencia de chunk grande, no
   bloqueante, candidato a code-splitting más adelante si molesta).
4. Container de nginx levantado standalone → `/` y `/kpis` (ruta de cliente, no un
   archivo real) devuelven 200 — el fallback de SPA funciona.
5. `caddy validate` sobre el `Caddyfile` → `Valid configuration`.

## 4. Hallazgo real durante la verificación (ya corregido)

`Dockerfile.prod` de la API originalmente corría `node dist/app.js` a secas y
crasheaba: `@srrhh/types` (`packages/types`) no tiene build propio — su
`package.json` apunta `main`/`exports` directo a `./src/index.ts` (fuente TS sin
compilar). Funciona en dev porque `tsx`/Vite transpilan al vuelo, pero un `node`
puro no puede parsear ese `.ts` al que apunta el symlink de pnpm. Se corrigió
corriendo el `dist/app.js` ya compilado con `tsx` en vez de `node` a secas — sigue
sin ser "modo watch", solo resuelve esa única dependencia sin compilar. Si en algún
sprint futuro se le agrega un build real a `packages/types`, este detalle se puede
sacar y volver a `node` puro.

## 5. Lo que falta — específico del servidor real

No hay forma de resolver esto sin la info real:

- **`DOMAIN`** — dominio o IP pública del servidor. Si es un dominio de verdad con
  80/443 abiertos a internet, Caddy pide el certificado TLS solo. Si es una IP
  interna, sirve HTTP plano sin drama (comportamiento nativo de Caddy, no hay que
  configurar nada distinto).
- **`ACME_EMAIL`** — contacto para avisos de Let's Encrypt (vencimiento de certs).
- **`DB_PASSWORD`** / **`JWT_SECRET`** — generar nuevos, no reusar los de dev.
- Confirmar que el servidor de destino no tiene ya algo escuchando en 80/443.

## 6. Cómo levantarlo cuando esos datos existan

```bash
cp .env.production.example .env.production
# completar DOMAIN / ACME_EMAIL / DB_PASSWORD / JWT_SECRET

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# primera vez con base vacía:
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
  pnpm exec prisma migrate deploy --schema=/repo/prisma/schema.prisma
```
