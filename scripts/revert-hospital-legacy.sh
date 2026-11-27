#!/bin/bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy

# Estos archivos son servicios legacy que buscan hospital por UUID (id)
# No deben apuntar a dimEfectores — dimEfectores tiene PK sigla, no id
LEGACY_FILES=(
  "apps/api/src/modules/bajas/bajas.service.ts"
  "apps/api/src/modules/cargos/cargos.service.ts"
  "apps/api/src/modules/concursos/concursos.service.ts"
  "apps/api/src/modules/solicitudes-alta/solicitudes-alta.service.ts"
  "apps/api/src/modules/solicitudes-alta/solicitudes-alta.pdf.ts"
  "apps/api/src/modules/incidencias/incidencias.service.ts"
  "apps/api/src/modules/padron/padron.service.ts"
  "apps/api/src/shared/derivarCargosConduccion.ts"
  "apps/api/src/modules/hospitales/hospitales.routes.ts"
)

for f in "${LEGACY_FILES[@]}"; do
  sed -i 's/prisma\.dimEfectores/prisma.hospital/g' "$f"
  echo "reverted: $f"
done
