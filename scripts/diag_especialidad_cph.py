"""
Diagnóstico (SOLO LECTURA) de especialidad mal asignada en cargos de CPH (cód. 37).

Compara, para cada cargo CPH vigente con ocupación activa, la especialidad que
tiene el cargo en el catálogo (especialidades_puesto.nombre vía
cargos.especialidad_puesto_id) contra la que trajo el ÚLTIMO padron_historico
del rol (padron_historico.especialidad). Separa:
  - FORMATO: distintas en crudo pero IGUALES al normalizar (tilde, "•", "(...)",
    "-", mayúsculas). NO son errores; el sistema ya las consolidó bien.
  - CRUCE REAL: distintas incluso normalizadas → especialidad genuinamente
    equivocada (ej. el cargo dice "cirugia general" pero el padrón "cirugia
    plastica y reparadora"). Esto es lo que hay que revisar manual.

La normalización replica la acordada con el usuario: minúscula, sin tildes,
sin "• " inicial, sin "(...)" y su contenido, sin guiones, espacios colapsados.

Uso (dentro del contenedor, que tiene DATABASE_URL -> postgres:5432):
  docker compose cp scripts/diag_especialidad_cph.py srrhh_api:/tmp/diag_cph.py
  docker compose exec -T srrhh_api node ... (NO: es Python)
  -> se corre con el contenedor que tenga Python+sqlalchemy (dotaneitor):
  docker compose cp scripts/diag_especialidad_cph.py srrhh_dotaneitor:/tmp/diag_cph.py
  docker compose exec -T srrhh_dotaneitor python3 /tmp/diag_cph.py

NO modifica datos.
"""
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL no configurada')
    sys.exit(1)

engine = create_engine(DATABASE_URL)


def norm(txt):
    """minúscula, sin tildes, sin '• ', sin '(...)', sin '-', espacios colapsados."""
    if not txt:
        return ''
    s = txt.strip().lower()
    # sin tildes (NFD + quitar diacríticos; conserva ñ)
    s = ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if not (unicodedata.category(c) == 'Mn' and c != '\u0303')
    )
    s = unicodedata.normalize('NFC', s)
    s = s.replace('•', ' ')
    s = re.sub(r'\([^)]*\)', ' ', s)   # quita "(...)" y contenido
    s = s.replace('-', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# Un cargo CPH vigente con ocupación activa: su especialidad de catálogo vs la
# del último padrón del rol. DISTINCT ON por rol = la fila más reciente.
SQL = text("""
WITH ult AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
         ph.cargo_id, ph.id_sial_rol, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
)
SELECT p.apellido_nombre, p.cuil, c.codigo AS cargo, pc.nombre AS puesto,
       h.sigla, u.esp_padron, ep.nombre AS esp_sistema
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '37'
JOIN ult u ON u.cargo_id = c.id
JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
JOIN puestos_cargo pc ON pc.id = c.puesto_cargo_id
JOIN personas p ON p.id = o.persona_id
JOIN hospitales h ON h.id = c.hospital_id
""")

with engine.connect() as conn:
    rows = conn.execute(SQL).mappings().all()

print(f'Cargos CPH (37) vigentes con especialidad y padrón: {len(rows)}')

formato = 0
cruces = []  # (esp_padron_norm, esp_sistema_norm, fila)
pares_cruce = Counter()

for r in rows:
    np = norm(r['esp_padron'])
    ns = norm(r['esp_sistema'])
    if np == ns:
        continue  # idénticas crudas o no, acá ya coinciden normalizadas => no es discrepancia real
    formato += 0
    # distintas en crudo; ver si es solo formato o cruce real
    # (si llegaron acá con np==ns ya se saltaron; así que esto es cruce real)
    cruces.append(r)
    pares_cruce[(np, ns)] += 1

# Recalcular: distinguir formato (crudo distinto pero norm igual) de cruce real.
solo_formato = 0
reales = []
pares_reales = Counter()
for r in rows:
    crudo_distinto = (r['esp_padron'].strip().lower() != r['esp_sistema'].strip().lower())
    np, ns = norm(r['esp_padron']), norm(r['esp_sistema'])
    if np == ns:
        if crudo_distinto:
            solo_formato += 1
        continue
    reales.append(r)
    pares_reales[(np, ns)] += 1

print(f'\n== FORMATO (distinto crudo, igual normalizado — NO es error): {solo_formato} cargos')
print(f'== CRUCE REAL (especialidad genuinamente distinta): {len(reales)} cargos\n')

print('--- Pares de cruce real (padron_norm -> sistema_norm : cantidad) ---')
for (np, ns), n in pares_reales.most_common():
    print(f'  [{n:>3}] "{np}"  ->  "{ns}"')

print('\n--- Detalle fila por fila de los cruces reales ---')
for r in reales:
    print(f'  {r["apellido_nombre"]} | CUIL {r["cuil"]} | {r["cargo"]} | {r["sigla"]} | '
          f'puesto="{r["puesto"]}" | PADRON="{r["esp_padron"]}" | SISTEMA="{r["esp_sistema"]}"')
