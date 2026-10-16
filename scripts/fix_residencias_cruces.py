"""
Corrección del bug de cruces de especialidad en Residencias (cód. 24).

Reapunta cargos.especialidad_puesto_id a la especialidad que el PADRÓN indica
(fuente de verdad), resuelta dentro del MISMO puesto del cargo por nombre
normalizado. Solo toca cargos VIGENTES CORREGIBLES (match exacto del padrón en
el puesto, distinto de la especialidad actual). No toca OK ni SIN_MATCH.

Modo:
  python3 fix_residencias_cruces.py            -> DRY-RUN (cuenta, no escribe)
  python3 fix_residencias_cruces.py --commit   -> aplica en UNA transacción

Uso:
  docker compose cp scripts/fix_residencias_cruces.py dotaneitor:/tmp/fix_res.py
  docker compose exec -T dotaneitor python3 /tmp/fix_res.py            # dry-run
  docker compose exec -T dotaneitor python3 /tmp/fix_res.py --commit   # aplicar
"""
import os, re, sys, unicodedata
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL no configurada'); sys.exit(1)
engine = create_engine(DATABASE_URL)
COMMIT = '--commit' in sys.argv


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


SQL_CARGOS = text("""
WITH ult AS (
  -- Una especialidad por CARGO: la del rol/fila más reciente (ocupante actual).
  -- DISTINCT ON cargo_id (no id_sial_rol): un cargo puede tener varios roles
  -- históricos (distintas personas/períodos); nos quedamos con el último.
  SELECT DISTINCT ON (ph.cargo_id) ph.cargo_id, ph.especialidad AS esp_padron
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.cargo_id, ph.fecha_asignada DESC, ph.id DESC
)
SELECT c.id AS cargo_id, c.puesto_cargo_id,
       ep.id AS esp_sistema_id, ep.nombre AS esp_sistema, u.esp_padron
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '24'
JOIN ult u ON u.cargo_id = c.id
JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
""")
SQL_CAT = text("SELECT id, puesto_cargo_id, nombre FROM especialidades_puesto")

with engine.connect() as conn:
    cargos = conn.execute(SQL_CARGOS).mappings().all()
    catalogo = conn.execute(SQL_CAT).mappings().all()

# Índice (puesto, nombre_norm) -> id destino DETERMINÍSTICO (min id si hubiera
# varias filas con el mismo nombre en el puesto; con 0 duplicados es una sola).
cat_idx = {}
for e in catalogo:
    key = (str(e['puesto_cargo_id']), norm(e['nombre']))
    eid = str(e['id'])
    if key not in cat_idx or eid < cat_idx[key]:
        cat_idx[key] = eid

updates = []  # (cargo_id, esp_correcta_id)
sin_match = 0
ya_ok = 0
for c in cargos:
    np, ns = norm(c['esp_padron']), norm(c['esp_sistema'])
    if np == ns:
        # El NOMBRE ya coincide con el padrón -> OK, no tocar (aunque el id sea otro).
        ya_ok += 1
        continue
    correcta = cat_idx.get((str(c['puesto_cargo_id']), np))
    if correcta is None:
        sin_match += 1
        continue
    # Nombre distinto -> reapuntar al id determinístico de la especialidad del padrón.
    updates.append((str(c['cargo_id']), correcta))

print(f'Cargos vigentes Residencias analizados: {len(cargos)}')
print(f'A CORREGIR (reapuntar): {len(updates)}')
print(f'SIN_MATCH (no se tocan): {sin_match}')

if not COMMIT:
    print('\n[DRY-RUN] No se escribió nada. Usar --commit para aplicar.')
    sys.exit(0)

# Aplicar en una transacción, por lotes.
with engine.begin() as conn:
    for i in range(0, len(updates), 1000):
        lote = updates[i:i+1000]
        conn.execute(
            text("UPDATE cargos SET especialidad_puesto_id = :esp WHERE id = :cid"),
            [{'cid': cid, 'esp': esp} for cid, esp in lote]
        )
print(f'\n[COMMIT] {len(updates)} cargos reapuntados a la especialidad del padrón.')
