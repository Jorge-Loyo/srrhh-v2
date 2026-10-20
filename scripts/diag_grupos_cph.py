"""
Diagnóstico (SOLO LECTURA) de GRUPOS de especialidad en cargos CPH (cód. 37) VIGENTES.

Diferencia clave respecto del intento anterior:
  - Mira SOLO el cargo VIGENTE/ACTIVO de cada ocupación (o.hasta IS NULL,
    c.estado='vigente'). No mira cargos retenidos/baja (esos no cuentan para la
    foto de dotación activa). Esto evita falsos positivos como el de Cecchini,
    cuyo cargo activo (jefatura) ya tenía el grupo correcto y el "error" estaba
    en su cargo RETENIDO.
  - El foco es el campo GRUPO (agrupador transversal), NO la especialidad fina.
    La especialidad queda como está; lo que se cura es el grupo.

Reporta, para cargos CPH vigentes:
  (1) SIN GRUPO: especialidades de cargos vigentes que no tienen grupo asignado
      -> es lo que hay que clasificar (agregar al grupo que corresponda).
  (2) Resumen por grupo actual, para ver cómo está repartido hoy.
  (3) Listado de especialidades distintas sin grupo, con cuántos cargos vigentes
      las usan (para priorizar y proponer grupo).

Uso:
  docker compose cp scripts/diag_grupos_cph.py dotaneitor:/tmp/diag_grupos_cph.py
  docker compose exec -T dotaneitor python3 /tmp/diag_grupos_cph.py

NO modifica datos.
"""
import os
import sys
from collections import Counter

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print('ERROR: DATABASE_URL no configurada')
    sys.exit(1)

engine = create_engine(DATABASE_URL)

# Cargos CPH (37) VIGENTES con ocupación activa: su especialidad y grupo de catálogo.
# Criterio "vigente/activo" canónico del proyecto: o.hasta IS NULL AND c.estado='vigente'.
SQL = text("""
SELECT p.apellido_nombre, p.cuil, c.codigo AS cargo, pc.nombre AS puesto,
       h.sigla, o.situacion_revista,
       ep.id AS esp_id, ep.nombre AS especialidad, ep.grupo
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id AND c.estado = 'vigente' AND o.hasta IS NULL
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo = '37'
JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
JOIN puestos_cargo pc ON pc.id = c.puesto_cargo_id
JOIN personas p ON p.id = o.persona_id
JOIN hospitales h ON h.id = c.hospital_id
""")

with engine.connect() as conn:
    rows = conn.execute(SQL).mappings().all()

total = len(rows)
sin_grupo = [r for r in rows if not r['grupo'] or not r['grupo'].strip()]
con_grupo = total - len(sin_grupo)

print(f'=== CPH (37) — cargos VIGENTES con especialidad: {total} ===')
print(f'  con grupo asignado: {con_grupo}')
print(f'  SIN grupo asignado: {len(sin_grupo)}')

# (2) Resumen por grupo actual
print('\n--- Reparto por grupo actual (cargos vigentes) ---')
por_grupo = Counter((r['grupo'] or '(SIN GRUPO)').strip() or '(SIN GRUPO)' for r in rows)
for g, n in por_grupo.most_common():
    print(f'  [{n:>4}] {g}')

# (3) Especialidades SIN grupo, con cuántos cargos vigentes las usan
print('\n--- Especialidades SIN GRUPO en cargos vigentes (a clasificar) ---')
esp_sin_grupo = Counter(r['especialidad'] for r in sin_grupo)
for esp, n in esp_sin_grupo.most_common():
    print(f'  [{n:>4}] "{esp}"')

# (4) Detalle de personas con cargo vigente SIN grupo (para revisión)
print('\n--- Detalle (persona | cargo | puesto | especialidad SIN grupo) ---')
for r in sin_grupo:
    print(f'  {r["apellido_nombre"]} | CUIL {r["cuil"]} | {r["cargo"]} | {r["sigla"]} | '
          f'puesto="{r["puesto"]}" | esp="{r["especialidad"]}" | sitRev={r["situacion_revista"]}')
