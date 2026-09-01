#!/bin/bash
wget -qO /tmp/login.json \
  --post-data='{"username":"admin","password":"admin123"}' \
  --header='Content-Type: application/json' \
  http://172.18.0.2:3000/api/v1/auth/login 2>/dev/null

TOKEN=$(python3 -c "import json,sys; d=json.load(open('/tmp/login.json')); print(d['data']['accessToken'])")
echo "Token OK: ${TOKEN:0:20}..."

wget -qO- \
  --header="Authorization: Bearer $TOKEN" \
  'http://172.18.0.2:3000/api/v1/cargos/altas?limit=3' 2>/dev/null
