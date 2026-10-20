"""
Diagnóstico (SOLO LECTURA) de CRUCES REALES de especialidad en Residencias (cód. 24).

Para cada cargo VIGENTE de Residencias con ocupación activa:
  - esp_sistema = especialidad a la que apunta el cargo hoy (catálogo).
  - esp_padron  = especialidad que trajo el último padron_historico del rol.
  - Se busca, DENTRO DEL MISMO PUESTO del cargo, la especialidad del catálogo
    cuyo nombre normalizado coincide con el texto del padrón normalizado
    (esp_correcta). Esa sería la asignación correcta.

Clasifica cada cargo:
  OK            -> esp_sistema ya coincide (normalizada) con el padrón. Nada que hacer.
  CORREGIBLE    -> existe esp_correcta en el puesto y es DISTINTA de la actual
                   -> el cargo debería reapuntar a esp_correcta.
  SIN_MATCH     -> el texto del padrón no matchea ninguna especialidad del puesto
                   (no se puede autocorregir; queda para revisión manual).

Normalización: minúscula, sin tildes, sin "•", sin "(...)", sin "-", espacios
colapsados (misma regla acordada).

Uso:
  docker compose cp scripts/diag_residencias_cruces.py dotaneitor:/tmp/diag_res.py
  docker compose exec -T dotaneitor python3 /tmp/diag_res.py
NO modifica datos.
"""
import os, re, sys, unicodedata
from collections import Counter
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL no configurada'); sys.exit(1)
engine = create_engine(DATABASE_URL)


def norm(txt):
    if not txt:
        return ''
    s = txt.strip().lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if not (unicodedata.category(c) == 'Mn' and c != '\u0303'))
    s = unicodedata.normalize('NFC', s)
    s = s.replace('•', ' ')
    s = re.sub(r'\([^)]*\)', ' ', s)
    s = s.replace('-', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# Cargos vigentes de Residencias: especialidad actual + texto del padrón + puesto.
SQL_CARGOS = text("""
WITH ult AS (
  -- Una especialidad por CARGO: la del rol/fila más reciente (ocupante actual).
  SELECT DISTINCT ON (ph.cargo_id) ph.cargo_id, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.cargo_id, ph.fecha_asignada DESC, ph.id DESC
)
SELECT c.id AS cargo_id, c.codigo AS cargo, c.puesto_cargo_id,
       p.apellido_nombre, p.cuil, h.sigla,
       ep.id AS esp_sistema_id, ep.nombre AS esp_sistema, ep.grupo AS grupo_sistema,
       u.esp_padron
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '24'
JOIN ult u ON u.cargo_id = c.id
JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
JOIN puestos_cargo pc ON pc.id = c.puesto_cargo_id
JOIN personas p ON p.id = o.persona_id
JOIN hospitales h ON h.id = c.hospital_id
""")

# Catálogo de especialidades por puesto (para resolver esp_correcta).
SQL_CATALOGO = text("""
SELECT id, puesto_cargo_id, nombre, grupo FROM especialidades_puesto
""")

with engine.connect() as conn:
    cargos = conn.execute(SQL_CARGOS).mappings().all()
    catalogo = conn.execute(SQL_CATALOGO).mappings().all()

# Índice: (puesto_id, nombre_norm) -> fila catálogo
cat_idx = {}
for e in catalogo:
    cat_idx[(str(e['puesto_cargo_id']), norm(e['nombre']))] = e

ok = corregibles = sin_match = 0
pares_corregibles = Counter()
detalle_corregibles = []

for c in cargos:
    np = norm(c['esp_padron'])
    ns = norm(c['esp_sistema'])
    if np == ns:
        ok += 1
        continue
    correcta = cat_idx.get((str(c['puesto_cargo_id']), np))
    if correcta is None:
        sin_match += 1
        continue
    if str(correcta['id']) == str(c['esp_sistema_id']):
        ok += 1
        continue
    corregibles += 1
    pares_corregibles[(c['esp_sistema'], c['esp_padron'], correcta['nombre'])] += 1
    detalle_corregibles.append((c, correcta))

print(f'=== Residencias (24) — cargos vigentes analizados: {len(cargos)} ===')
print(f'  OK (ya coincide con el padrón):        {ok}')
print(f'  CORREGIBLE (reapuntar a esp correcta): {corregibles}')
print(f'  SIN_MATCH (padron no existe en puesto): {sin_match}')

print('\n--- Pares CORREGIBLES (sistema_actual | padron | -> correcta : n) ---')
for (sis, pad, cor), n in pares_corregibles.most_common(60):
    print(f'  [{n:>4}] "{sis}"  (padron:"{pad}")  ->  "{cor}"')
