#!/usr/bin/env bash
# Aplica a mano en Neon las migraciones del wizard CEETPS (Sprint 27) y las marca como
# resueltas en Prisma ANTES del push (ver Doc/Desarrollo/DEPLOY_PRODUCCION.md §7, trampa 1).
#
# Uso (desde la raíz del repo, en una terminal con psql y pnpm):
#   NEON_URL=$(grep 'neon.tech' apps/api/.env | sed -E 's/^#\s*//; s/^DATABASE_URL=//; s/^"//; s/"$//')
#   export NEON_DIRECT=$(echo "$NEON_URL" | sed -E 's/-pooler//; s/:6432/:5432/; s/[?&]channel_binding=require//')
#   bash scripts/aplicar_migraciones_ceetps_neon.sh
#
# Todas las migraciones son idempotentes (IF NOT EXISTS / UPDATE acotado), así que
# re-ejecutar el script no rompe nada. La 20261124020000 BORRA de `observaciones` de
# concursos_ceetps las líneas que empiezan con "[ETL]" (aprobado por Agustín).
set -euo pipefail

: "${NEON_DIRECT:?Falta NEON_DIRECT (ver el encabezado de este script)}"

MIGRACIONES=(
  20261118000000_ceetps_jurado_inscriptos_etapa5
  20261124000000_ceetps_etapa4_insal_reserva
  20261124010000_ceetps_designado_referencia
  20261124020000_ceetps_limpiar_observaciones_etl
  20261124030000_ceetps_historial_designacion
)

echo "== Migraciones registradas hoy en Neon (últimas 8) =="
psql "$NEON_DIRECT" -c "SELECT migration_name, finished_at IS NOT NULL AS aplicada FROM _prisma_migrations ORDER BY started_at DESC LIMIT 8"

read -r -p "¿Aplicar las ${#MIGRACIONES[@]} migraciones en NEON (producción)? [escribir SI] " r
[ "$r" = "SI" ] || { echo "Cancelado."; exit 1; }

for m in "${MIGRACIONES[@]}"; do
  echo "== Aplicando $m =="
  psql "$NEON_DIRECT" -v ON_ERROR_STOP=1 -f "prisma/migrations/$m/migration.sql"
done

for m in "${MIGRACIONES[@]}"; do
  echo "== Marcando como resuelta $m =="
  DATABASE_URL="$NEON_DIRECT" pnpm --filter @srrhh/api exec prisma migrate resolve --applied "$m" \
    --schema=../../prisma/schema.prisma || echo "(ya estaba registrada, se sigue)"
done

echo "== Verificación =="
psql "$NEON_DIRECT" -c "SELECT count(*) FILTER (WHERE observaciones LIKE '%[ETL]%') AS con_etl FROM concursos_ceetps"
psql "$NEON_DIRECT" -c "\d designaciones_historial_ceetps" | head -5
echo "Listo. Ahora sí se puede pushear."
