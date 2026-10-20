# Guía de actualización (UPGRADE)

Instrucciones para llevar a cabo la instalación de cada nueva versión, conforme
al Anexo I del Estándar de Desarrollo ASI ES0901. Cada entrada indica la fecha,
los cambios aplicados y los pasos necesarios (migraciones de base de datos,
variables de entorno nuevas, seeds, montaje de volúmenes, etc.).

Las entradas se ordenan de la más reciente a la más antigua.

---

## [No publicado] — 2026-10-16

### Resumen
Health checks liveness/readiness en la API, mudanza de los gráficos de evolución
de dotación a Reportes, filtro de etapa y encabezado colapsable en el wizard CPH.

### Pasos de actualización

1. **Actualizar código y dependencias**

   ```bash
   git pull
   pnpm install
   ```

2. **Aplicar migraciones de base de datos** (Prisma Migrate)

   ```bash
   pnpm db:migrate        # local
   # En entornos dockerizados/Render el arranque corre `prisma migrate deploy`
   # automáticamente vía start.sh.
   ```

   Migraciones incluidas en esta tanda:
   - `20261013000000_s22_12_jefatura_fk` — FK de jefatura (ocupaciones →
     puestos_cargo). Aditiva y nullable, no requiere backfill.
   - `20261006000000_director_crear_concurso` — permiso de creación de concurso
     para el rol Director.

3. **Rebuild de la imagen de la API** (necesario por los nuevos endpoints de
   health y el procesamiento asíncrono del padrón)

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build api
   ```

4. **Permiso del módulo Reportes** (si la pestaña "Reportes" no aparece en el
   menú). El permiso `reportes:ver` debe existir y estar asignado al rol
   correspondiente. Alta del permiso:

   ```bash
   # dentro del contenedor de Postgres, o vía psql contra la base
   psql "$DATABASE_URL" -f scripts/seed_reportes_permisos.sql
   ```

   Luego asignarlo al/los rol(es) desde el backoffice de administración de
   roles de la aplicación (o por SQL sobre `role_permisos`).

### Verificación post-actualización

```bash
curl -s http://localhost:3000/health/liveness    # {"status":"ok"}
curl -s http://localhost:3000/health/readiness   # {"status":"ok","checks":{"database":"ok"}}
```

Si `readiness` devuelve `503`, revisar la conexión a PostgreSQL
(`DATABASE_URL`) antes de habilitar tráfico a la instancia.

---

> Para el detalle de requisitos, puertos y troubleshooting del entorno local ver
> `Doc/Desarrollo/ARRANQUE_LOCAL.md`.
