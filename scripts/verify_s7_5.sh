#!/bin/bash
API="http://172.18.0.2:3000"

wget -qO /tmp/login.json \
  --post-data='{"username":"admin","password":"admin123"}' \
  --header='Content-Type: application/json' \
  $API/api/v1/auth/login 2>/dev/null

TOKEN=$(python3 -c "import json; print(json.load(open('/tmp/login.json'))['data']['accessToken'])")

# Obtener hospitalId de DGCOR y escalafonId de Médicos
wget -qO /tmp/hospitales.json --header="Authorization: Bearer $TOKEN" $API/api/v1/hospitales 2>/dev/null
HOSPITAL_ID=$(python3 -c "import json; h=[x for x in json.load(open('/tmp/hospitales.json'))['data'] if x['sigla']=='DGCOR'][0]['id']; print(h)")

wget -qO /tmp/escalafones.json --header="Authorization: Bearer $TOKEN" $API/api/v1/escalafones 2>/dev/null
ESCALAFON_ID=$(python3 -c "import json; e=[x for x in json.load(open('/tmp/escalafones.json'))['data'] if x['nombre']=='Médicos'][0]['id']; print(e)")

echo "Hospital DGCOR: $HOSPITAL_ID"
echo "Escalafon Medicos: $ESCALAFON_ID"

# Test 1: debe dar 409 (ya existe Farmaceutico de Planta en DGCOR/Médicos)
echo ""
echo "=== Test 1: POST sin forzar (espera 409) ==="
BODY="{\"hospitalId\":\"$HOSPITAL_ID\",\"escalafonId\":\"$ESCALAFON_ID\",\"literalPuesto\":\"Farmaceutico de Planta\",\"unificadorPuesto\":\"POF\",\"cantidad\":1}"
wget -qO- --post-data="$BODY" \
  --header="Authorization: Bearer $TOKEN" \
  --header='Content-Type: application/json' \
  --server-response \
  $API/api/v1/cargos 2>&1 | grep -E 'HTTP/|conflict|codigo|CONFLICT'

# Test 2: con forzar:true debe dar 201
echo ""
echo "=== Test 2: POST con forzar:true (espera 201) ==="
BODY2="{\"hospitalId\":\"$HOSPITAL_ID\",\"escalafonId\":\"$ESCALAFON_ID\",\"literalPuesto\":\"Farmaceutico de Planta\",\"unificadorPuesto\":\"POF\",\"cantidad\":1,\"forzar\":true}"
wget -qO /tmp/forzar.json --post-data="$BODY2" \
  --header="Authorization: Bearer $TOKEN" \
  --header='Content-Type: application/json' \
  --server-response \
  $API/api/v1/cargos 2>&1 | grep -E 'HTTP/|codigo'
python3 -c "import json; d=json.load(open('/tmp/forzar.json')); print('Codigo creado:', d['data'][0]['codigo'])" 2>/dev/null
