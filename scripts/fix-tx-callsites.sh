#!/bin/bash
cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy

FILES=$(grep -rln \
  'tx\.organigrama\b\|tx\.organigramaUpload\b\|tx\.pou\b\|tx\.pouDecreto\b\|tx\.pouDecretoMapeoHospital\b\|tx\.pouDecretoCarga\b\|tx\.syncCorrida\b' \
  apps/api/src/ 2>/dev/null | grep -v '\.js$\|\.bak$')

for f in $FILES; do
  sed -i \
    -e 's/tx\.organigrama\b/tx.dimOrganigrama/g' \
    -e 's/tx\.organigramaUpload\b/tx.dimOrganigramaUpload/g' \
    -e 's/tx\.pou\b/tx.dimPouOcupacion/g' \
    -e 's/tx\.pouDecreto\b/tx.dimPouDecreto/g' \
    -e 's/tx\.pouDecretoMapeoHospital\b/tx.dimPouDecretoMapeo/g' \
    -e 's/tx\.pouDecretoCarga\b/tx.dimPouDecretoCarga/g' \
    -e 's/tx\.syncCorrida\b/tx.dimSyncCorrida/g' \
    "$f"
  echo "updated tx: $f"
done
