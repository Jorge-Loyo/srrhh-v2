# Deploy de producción — S6-7

> Borrador armado el 2026-08-31 sin acceso a los datos reales del servidor de destino.
> Las 3 imágenes Docker (api, web, y el Caddyfile) están **verificadas** — no es solo
> teoría, se construyeron y se corrieron de verdad contra la base de datos local. Lo
> que falta es específico del servidor real: dominio, contraseñas, y decidir si hay
> algo más corriendo en ese servidor que compita por los puertos 80/443.
>
> Para la referencia completa del stack Docker ver `Doc/Contrato_Docker.md`.

---

## 1. Qué es cada archivo nuevo

| Archivo                    | Para qué                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.prod.yml`  | Stack completo de producción: postgres + api + dotaneitor + web + caddy                                                   |
| `apps/api/Dockerfile.prod` | Build multi-stage de la API — corre el JS ya compilado (`tsc`), no `tsx watch` como el de dev                             |
| `apps/web/Dockerfile.prod` | Build multi-stage del frontend — bundle estático de Vite servido por nginx                                                |
| `apps/web/nginx.prod.conf` | Config de nginx con fallback de SPA (`try_files ... /index.html`), si no cualquier F5 en una ruta que no sea `/` tira 404 |
| `Caddyfile`                | Reverse proxy + TLS automático (Let's Encrypt) — enruta `/api/*` y `/health` a la API, el resto al frontend               |
| `.env.production.example`  | Plantilla de las variables que hay que completar — copiar a `.env.production` (gitignoreado)                              |

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

---

## 7. Flujo de deploy VIGENTE (Render + Vercel + Neon) — 2026-10

> ⚠️ Las secciones 1–6 describen un stack Docker/Caddy autohospedado que **no es el que
> está en uso**. El deploy real hoy es: **backend en Render**, **frontend en Vercel**,
> **base de datos en Neon** (Postgres gestionado). Esta sección documenta ese flujo y el
> checklist que evita los dos problemas que rompieron el deploy del 2026-10-22.

### Topología real

| Componente            | Dónde corre                           | De qué rama/commit despliega                   |
| --------------------- | ------------------------------------- | ---------------------------------------------- |
| Backend (API Fastify) | Render (`srrhh-v2.onrender.com`)      | `main` del fork `deploy` (Jorge-Loyo/srrhh-v2) |
| Frontend (Vite/React) | Vercel (`web-pied-rho-26.vercel.app`) | `main`                                         |
| Base de datos         | Neon (`ep-aged-water-...` / `neondb`) | — (compartida entre local y producción)        |

- **El desarrollo local apunta a la MISMA Neon que producción** (override temporal en
  `docker-compose.override.yml`). Por eso un dato que se ve bien en `localhost:5180` se
  ve igual en producción: la base es la misma. Si algo difiere entre local y prod con la
  misma base, el problema es de **código desplegado** o **config**, nunca de datos.
- **Render corre `prisma migrate deploy` en cada arranque** (no es manual).

### Secuencia de push (la que se usa)

```bash
# adelantar main y deploy locales a la rama de trabajo (jorge)
git update-ref refs/heads/main jorge
git update-ref refs/heads/deploy jorge
# push a origin (SRRHH-GCBA) las tres ramas
git push origin refs/heads/jorge:refs/heads/jorge refs/heads/main:refs/heads/main refs/heads/deploy:refs/heads/deploy < /dev/null
# push al fork deploy (Jorge-Loyo) — dispara Render y Vercel (ambos buildean de main)
git push deploy refs/heads/main:refs/heads/main < /dev/null
```

### ⚠️ Checklist de deploy — DOS trampas que rompen producción

Estos dos pasos causaron el incidente del 2026-10-22 (login caído + gráficos vacíos en
prod). Revisarlos SIEMPRE que el deploy incluya una migración Prisma o toque la tabla de
KPIs.

**1. Migración Prisma aplicada a mano en Neon → marcarla como resuelta ANTES de pushear.**

El flujo de esta sesión aplica las migraciones **a mano** en Neon (psql directo), porque
el backend local apunta a Neon producción y no se corre `prisma migrate dev/deploy`
contra ella desde local. PERO Render SÍ corre `prisma migrate deploy` al arrancar. Si
encuentra una migración que figura como "pendiente" pero cuyas columnas **ya existen**
(porque se aplicó a mano), el `ALTER TABLE ... ADD COLUMN` falla, Prisma marca la
migración como **failed** y bloquea TODO con **error P3009** (`migrate found failed
migrations, new migrations will not be applied`). Resultado: el backend no arranca limpio
→ login caído, rutas nuevas con 404, endpoints inconsistentes.

Opciones para evitarlo (elegir una):

- **(a)** NO aplicar la migración a mano; dejar que Render la aplique en el deploy.
- **(b)** Si se aplica a mano, **marcarla como aplicada** en el registro de Prisma antes
  de pushear, con una de estas dos:
  - `DATABASE_URL="$NEON_DIRECT" pnpm --filter @srrhh/api exec prisma migrate resolve --applied <nombre_migracion>`
  - o, si el `migrate resolve` choca con el advisory lock de un deploy de Render en curso
    (error P1002 / `advisory lock timeout`), marcarla por SQL directo (no usa el lock):
    ```sql
    UPDATE _prisma_migrations
    SET finished_at = now(), logs = NULL, applied_steps_count = 1
    WHERE migration_name = '<nombre_migracion>' AND finished_at IS NULL;
    ```

Para diagnosticar un P3009 en producción, ver cuál migración quedó failed:

```sql
SELECT migration_name, finished_at, (finished_at IS NULL) AS fallida
FROM _prisma_migrations ORDER BY started_at DESC LIMIT 8;
```

La fila con `finished_at` vacío es la que bloquea. Resolverla (SQL de arriba) y
**redeploy manual en Render** (Manual Deploy → Deploy latest commit).

**2. Backfill de KPIs después de CUALQUIER migración que recree `kpis_dotacion_snapshot`.**

La migración `20261020000001`... (y la `20261020000000` de KPIs) hacen **DROP + CREATE**
de `kpis_dotacion_snapshot` → la tabla queda **VACÍA**. El backfill que la repuebla es un
script de DATOS aparte, NO una migración Prisma, así que Render NO lo corre. Si no se
re-corre, el endpoint `/api/v1/kpis/dotacion-historica` responde 200 pero vacío, y las
tarjetas de `/reportes` muestran "Todavía no hay snapshots de padrón aprobados para
graficar" aunque haya padrones aprobados.

Tras el deploy (o tras aplicar esa migración), re-correr SIEMPRE, en orden:

```bash
# 1) normalizar situacion de revista (si la migración la tocó)
docker compose exec -T postgres sh -c "psql '$NEON_DIRECT'" < scripts/normalizar_situacion_revista.sql
# 2) re-backfill de la tabla materializada de KPIs
docker compose exec -T postgres sh -c "psql '$NEON_DIRECT'" < scripts/backfill_kpis_dotacion.sql
# verificar que quedó poblada (debe dar cientos de filas y ~10 meses)
docker compose exec -T postgres sh -c "psql '$NEON_DIRECT' -c \"SELECT count(*), count(DISTINCT fecha) FROM kpis_dotacion_snapshot\""
```

### Orden recomendado de un deploy con migración + datos

1. Aplicar la migración a mano en Neon (o dejar que la aplique Render — elegir).
2. Si se aplicó a mano: marcarla como resuelta en `_prisma_migrations` (trampa 1).
3. Push (secuencia de arriba).
4. Verificar que Render arranca sin P3009 (logs: sin "Migration attempt failed",
   `Your service is live`).
5. Re-correr los scripts de datos que la migración dejó pendientes: normalización +
   backfill de KPIs (trampa 2).
6. Recargar producción (Ctrl+Shift+R) y validar: login (email/CUIL/username), `/perfil`,
   `/reportes` (tarjetas con datos).

### Reconstruir `NEON_DIRECT` (en cada terminal WSL nueva)

```bash
NEON_URL=$(grep 'neon.tech' apps/api/.env | sed -E 's/^#\s*//; s/^DATABASE_URL=//; s/^"//; s/"$//')
export NEON_DIRECT=$(echo "$NEON_URL" | sed -E 's/-pooler//; s/:6432/:5432/; s/[?&]channel_binding=require//')
```

(quita `-pooler` y el `:6432`→`:5432` para usar la conexión directa, necesaria para DDL
y para `prisma migrate resolve`.)

## 8. Interruptor de nomenclatura de códigos de cargo (`NOMENCLATURA_CODIGO_CARGO`)

La sincronización de cargos con el Excel MSGC (`apps/api/scripts/sync-cargos-msgc`, Fase 2) cambia los prefijos de los
códigos de cargo (`CPH-POF-000123` -> `CPH-P-000123`, `CPH-POU` -> `CPH-G`, `RG-CG` -> `GER`, reemplazantes `R-` adelante...).
El generador nuevo (acrónimos MSGC) **no puede activarse antes de que producción tenga la base recodificada**: mezclaría
prefijos viejos y nuevos y rompería el secuencial por prefijo. Por eso hay una variable de entorno de la API:

| Valor | Qué hace |
|---|---|
| `legacy` (**default**; también si no está definida o vacía) | Generador anterior: `CPH-POF/POU`, `TEC-POF/POU`, `RG-CG`, `AS-MIN/SS/DG/DGA`, `EG-D/G`, reemplazantes `CPH-POF-R-000001` (sufijo). |
| `msgc` | Acrónimos del Excel MSGC: `CPH-P`, `CPH-G`, `TEC`, `ENF`, `GER`, `AS`..., reemplazantes `R-CPH-P-000001` (prefijo). |

Cualquier otro valor hace fallar el arranque de la API (`env.ts`) y la generación de códigos: no se generan códigos con la
nomenclatura equivocada. Los llamadores (padrón, alta manual, autorizaciones, organigrama/conducción, retenciones, reemplazantes
de concursos y la carga de concursos CEETPS) pasan todos por `prefijoDeCargo` / `prefijoRemplazante` / `prefijoCeetpsPorSubCarrera`.
El **script de sincronización usa siempre los acrónimos MSGC** y no lee esta variable. La **lectura** de códigos (filtros de
conducción, organigrama, jurados) reconoce ambos formatos en los dos modos.

Consecuencias para el despliegue:
- Desplegar la rama `jorge` con la base ACTUAL de Neon: dejar `NOMENCLATURA_CODIGO_CARGO=legacy` (o sin definir). No cambia nada.
- **La base nueva (recodificada) requiere `NOMENCLATURA_CODIGO_CARGO=msgc`.** Se cambia en el mismo corte en que se apunta
  `DATABASE_URL` de Render a la base nueva (Render -> Environment -> editar la variable -> redeploy). Si la API queda en
  `legacy` con la base nueva, los cargos creados salen con prefijos viejos (`CPH-POF-...`) y el chequeo de "cero prefijos viejos" falla.
- Volver atrás (base anterior): poner de nuevo `legacy`.

### Escalafón CPH: dos estados de base soportados

La base actual tiene el escalafón CPH con `escalafones.codigo = '22'` y nombre "Nueva Carrera Prof. Hosp". La base nueva lo
tiene con código `37` y nombre "Nueva Carrera Profesional Hospitalaria" (los códigos de registro 22 y 37 siguen asociados y los
cargos conservan su CR). El código de la API y del front funciona con ambos estados, así que se puede desplegar **antes o después**
del cambio de base. Verificación rápida: `select codigo, nombre from escalafones where codigo in ('22','37');`.
Cuando producción esté en la base nueva se pueden retirar: el override de etiqueta de `apps/web/src/shared/lib/carreraEtiqueta.ts`
(`NOMBRE_MOSTRADO_POR_CODIGO`), la clave `'22'` de `CR_POR_CODIGO_ESCALAFON_GESTIONADO` (`packages/types`) y de `DESEMPATE_CR_POR_ESCALAFON`.

### KPIs de dotación tras el corte
La sincronización regenera `kpis_dotacion_snapshot` en la base local con el mismo motor que `scripts/backfill_kpis_dotacion.sql`. Si
la base nueva se arma con un `pg_dump` de la local validada, la tabla ya viaja regenerada; si no, correr el backfill de la trampa 2 (§7).
