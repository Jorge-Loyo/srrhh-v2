#!/bin/bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy

FILES=$(grep -rln \
  'prisma\.organigrama\b\|prisma\.organigramaUpload\b\|prisma\.pou\b\|prisma\.pouDecreto\b\|prisma\.pouDecretoMapeoHospital\b\|prisma\.pouDecretoCarga\b\|prisma\.syncCorrida\b\|prisma\.hospital\b' \
  apps/api/src/ 2>/dev/null | grep -v '\.js$\|\.bak$')

for f in $FILES; do
  sed -i \
    -e 's/prisma\.organigrama\b/prisma.dimOrganigrama/g' \
    -e 's/prisma\.organigramaUpload\b/prisma.dimOrganigramaUpload/g' \
    -e 's/prisma\.pou\b/prisma.dimPouOcupacion/g' \
    -e 's/prisma\.pouDecreto\b/prisma.dimPouDecreto/g' \
    -e 's/prisma\.pouDecretoMapeoHospital\b/prisma.dimPouDecretoMapeo/g' \
    -e 's/prisma\.pouDecretoCarga\b/prisma.dimPouDecretoCarga/g' \
    -e 's/prisma\.syncCorrida\b/prisma.dimSyncCorrida/g' \
    -e 's/prisma\.hospital\b/prisma.dimEfectores/g' \
    "$f"
  echo "updated: $f"
done
