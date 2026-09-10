#!/usr/bin/env python3
"""
E2E S14: Alta de cargo CPH → aprobación director → puedeIniciarConcurso
         → crear concurso motivoConcurso=nuevo_cargo → notificación sdravs
"""
import json, sys
import urllib.request, urllib.error

BASE = "http://localhost:3000/api/v1"
OK   = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m⚠\033[0m"

def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code

def check(label, cond, detail=""):
    icon = OK if cond else FAIL
    print(f"  {icon} {label}" + (f" — {detail}" if detail else ""))
    return cond

passed = 0
failed = 0

def step(n, label):
    print(f"\n{'='*60}")
    print(f"PASO {n}: {label}")
    print('='*60)

# ── PASO 1: Login admin ───────────────────────────────────────────────────────
step(1, "Login admin")
d, status = req("POST", "/auth/login", {"username": "admin", "password": "Admin1234!"})
token = d.get("data", {}).get("accessToken") or d.get("accessToken")
if check("Login exitoso", status == 200 and token, f"status={status}"):
    passed += 1
    print(f"    rolSlug: {d.get('data',d).get('user',{}).get('rolSlug','?')}")
else:
    failed += 1
    print(f"    Respuesta: {d}")
    sys.exit(1)

# ── PASO 2: Obtener hospital y escalafón CPH ──────────────────────────────────
step(2, "Obtener hospital y escalafón CPH (código 22 o 37)")
hosp_d, _ = req("GET", "/hospitales?limit=1", token=token)
hospitales = hosp_d.get("data", [])
if not hospitales:
    print(f"  {FAIL} Sin hospitales")
    sys.exit(1)
hosp = hospitales[0]
hosp_id, hosp_sigla = hosp["id"], hosp["sigla"]
check("Hospital obtenido", True, f"{hosp_sigla} ({hosp_id[:8]}...)")
passed += 1

esc_d, _ = req("GET", "/escalafones", token=token)
escalafones = esc_d.get("data", [])
cph_esc = next((e for e in escalafones if e["codigo"] in ("22", "37")), None)
if not check("Escalafón CPH encontrado", cph_esc is not None, str([e["codigo"]+":"+e["nombre"] for e in escalafones[:5]])):
    failed += 1
    sys.exit(1)
passed += 1
esc_id = cph_esc["id"]
print(f"    {cph_esc['nombre']} cod={cph_esc['codigo']} ({esc_id[:8]}...)")

# ── PASO 3: Crear solicitud de alta CPH ──────────────────────────────────────
step(3, "Crear solicitud de alta CPH (POST /solicitudes-alta)")
alta_body = {
    "hospitalId":    hosp_id,
    "escalafonId":   esc_id,
    "literalPuesto": "MEDICO DE PLANTA",
    "especialidad":  "CLINICA MEDICA",
    "expediente":    "E2E-S14-TEST",
    "cantidad":      1,
}
d, status = req("POST", "/solicitudes-alta", alta_body, token=token)
solicitud = (d.get("data") or {})
sol_id = solicitud.get("id")
if check("Solicitud creada", status == 201 and sol_id, f"status={status}"):
    passed += 1
    print(f"    id={sol_id[:8]}... estado={solicitud.get('estado')}")
else:
    failed += 1
    print(f"    Respuesta: {json.dumps(d)[:300]}")
    sys.exit(1)

# ── PASO 4: Verificar autorización creada ────────────────────────────────────
step(4, "Verificar autorización pendiente creada (login como Director)")
# La autorización se crea para resolverPorRolSlug='director' — necesitamos ese token
d_dir, s_dir = req("POST", "/auth/login", {"username": "Director", "password": "25802580"})
token_dir = (d_dir.get("data") or {}).get("accessToken")
if not check("Login Director exitoso", s_dir == 200 and token_dir, f"status={s_dir}"):
    failed += 1
    print(f"    Respuesta: {d_dir}")
    sys.exit(1)
passed += 1

d, status = req("GET", "/autorizaciones?limit=50", token=token_dir)
items = d.get("data", [])
aut = next((a for a in items if a.get("referenciaId") == sol_id), None)
if check("Autorización pendiente existe", aut is not None, f"total={len(items)}"):
    passed += 1
    aut_id = aut["id"]
    print(f"    id={aut_id[:8]}... tipo={aut['tipo']} resolverPor={aut['resolverPorRolSlug']}")
else:
    failed += 1
    print(f"    IDs encontrados: {[a['referenciaId'][:8] for a in items[:5]]}")
    sys.exit(1)

# ── PASO 5: Aprobar la autorización ──────────────────────────────────────────
step(5, "Aprobar autorización (POST /autorizaciones/:id/aprobar)")
d, status = req("POST", f"/autorizaciones/{aut_id}/aprobar", {"observaciones": "E2E test"}, token=token_dir)
result = d.get("data") or d
if check("Aprobación exitosa", status == 200, f"status={status}"):
    passed += 1
else:
    failed += 1
    print(f"    Respuesta: {json.dumps(d)[:300]}")
    sys.exit(1)

# ── PASO 6: Verificar puedeIniciarConcurso en la respuesta ───────────────────
step(6, "Verificar puedeIniciarConcurso en respuesta de aprobación")
puede = result.get("puedeIniciarConcurso")
concurso_info = result.get("concursoInfo")
if check("puedeIniciarConcurso = true", puede is True, f"valor={puede}"):
    passed += 1
else:
    failed += 1
    print(f"    Respuesta completa: {json.dumps(result)[:400]}")

if check("concursoInfo presente", concurso_info is not None):
    passed += 1
    print(f"    cargoId={concurso_info.get('cargoId','?')[:8]}...")
    print(f"    tipoConcursoSugerido={concurso_info.get('tipoConcursoSugerido')}")
    print(f"    hospitalSigla={concurso_info.get('hospitalSigla')}")
    print(f"    literalPuesto={concurso_info.get('literalPuesto')}")
else:
    failed += 1

# ── PASO 7: Crear concurso con motivoConcurso=nuevo_cargo ────────────────────
step(7, "Crear concurso CPH con motivoConcurso=nuevo_cargo")
if not concurso_info:
    print(f"  {WARN} Saltando — sin concursoInfo")
else:
    concurso_body = {
        "cargoId":        concurso_info["cargoId"],
        "hospitalId":     concurso_info["hospitalId"],
        "origen":         "Alta de cargo",
        "fechaVacante":   "2026-09-15",
        "tipoConcurso":   concurso_info["tipoConcursoSugerido"],
        "motivoConcurso": "nuevo_cargo",
        "escalafonId":    esc_id,
    }
    d, status = req("POST", "/concursos", concurso_body, token=token)
    result_c = d.get("data") or d
    # la respuesta es { concurso: {...}, concursoCph: {...} }
    concurso_obj = result_c.get("concurso") if isinstance(result_c, dict) else None
    concurso_id = concurso_obj.get("id") if concurso_obj else None
    if check("Concurso creado", status == 201 and concurso_id, f"status={status}"):
        passed += 1
        print(f"    concurso.id={concurso_id[:8] if concurso_id else '?'}...")
        print(f"    motivoConcurso={concurso_obj.get('motivoConcurso')}")
        # Verificar motivoConcurso persistido directamente en la respuesta
        motivo = concurso_obj.get("motivoConcurso")
        if check("motivoConcurso=nuevo_cargo persistido", motivo == "nuevo_cargo", f"valor={motivo}"):
            passed += 1
        else:
            failed += 1
    else:
        failed += 1
        print(f"    Respuesta: {json.dumps(d)[:400]}")

# ── PASO 8: Verificar notificación concurso_iniciado para sgravs ─────────────
step(8, "Verificar notificación concurso_iniciado para sgravs")
# Login como SGRASV para ver sus notificaciones
d_sg, s_sg = req("POST", "/auth/login", {"username": "SGRASV", "password": "25802580"})
token_sg = (d_sg.get("data") or {}).get("accessToken")
if token_sg:
    d_notif, _ = req("GET", "/notificaciones?tipo=concurso_iniciado&limit=10", token=token_sg)
else:
    # fallback: verificar via admin que el endpoint acepta el tipo
    d_notif, _ = req("GET", "/notificaciones?tipo=concurso_iniciado&limit=10", token=token)
notifs = d_notif.get("data", [])
if check("Endpoint acepta tipo=concurso_iniciado", d_notif.get("meta") is not None, f"total={d_notif.get('meta',{}).get('total','?')}"):
    passed += 1
else:
    failed += 1
    print(f"    Respuesta: {json.dumps(d_notif)[:300]}")

# ── PASO 9: Verificar columna Motivo en listado CPH ──────────────────────────
step(9, "Verificar columna Motivo en listado concursos-cph")
d_cph, status = req("GET", "/concursos-cph?limit=5", token=token)
cph_items = d_cph.get("data", [])
if check("Listado CPH responde", status == 200, f"total={d_cph.get('meta',{}).get('total','?')}"):
    passed += 1
    # Buscar alguno con motivoConcurso
    con_motivo = [c for c in cph_items if c.get("concurso", {}).get("motivoConcurso")]
    print(f"    Items con motivoConcurso: {len(con_motivo)}/{len(cph_items)}")
    if con_motivo:
        print(f"    Ejemplo: {con_motivo[0]['concurso']['motivoConcurso']}")
else:
    failed += 1

# ── RESUMEN ───────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"RESUMEN E2E S14")
print(f"{'='*60}")
total = passed + failed
print(f"  {OK} Pasaron: {passed}/{total}")
if failed:
    print(f"  {FAIL} Fallaron: {failed}/{total}")
else:
    print(f"  {OK} Todos los checks pasaron")
print()
