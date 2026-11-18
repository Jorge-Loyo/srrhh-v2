import openpyxl
import psycopg2
from collections import Counter

# Obtener los 449 cargos validacion_vacante de la BD
conn = psycopg2.connect("postgresql://srrhh_user:srrhh_pass@localhost:5434/srrhh_sync")
cur = conn.cursor()
cur.execute("SELECT codigo FROM cargos WHERE estado::text = 'validacion_vacante' AND deleted_at IS NULL ORDER BY codigo")
codigos_bd = {row[0] for row in cur.fetchall()}
cur.close()
conn.close()
print(f"Cargos validacion_vacante en BD: {len(codigos_bd)}")

# Leer Excel
path = "/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
ws = wb["NOMINAL DE CARGOS"]
rows = list(ws.iter_rows(values_only=True))
headers = rows[1]
col = {str(h).strip(): i for i, h in enumerate(headers) if h}

idx_codigo  = col["Código de Cargo"]
idx_id_sial = col["ID SIAL Rol"]
idx_estado  = col["Estado"]
idx_sit     = col["Situación"]
idx_cuil    = col["CUIL / Expediente"]
idx_nombre  = col.get("Apellido y nombre (control)")

# Cruzar
excel_map = {}
for row in rows[2:]:
    codigo = row[idx_codigo]
    if not codigo:
        continue
    excel_map[str(codigo).strip()] = {
        "estado":  str(row[idx_estado] or "").strip(),
        "sit":     str(row[idx_sit]    or "").strip(),
        "id_sial": row[idx_id_sial],
        "cuil":    row[idx_cuil],
        "nombre":  row[idx_nombre] if idx_nombre is not None else None,
    }

en_excel     = {c for c in codigos_bd if c in excel_map}
no_en_excel  = codigos_bd - en_excel

print(f"Encontrados en Excel: {len(en_excel)}")
print(f"NO encontrados en Excel: {len(no_en_excel)}")

# Distribución de estado+situación para los que están
dist = Counter()
for c in en_excel:
    r = excel_map[c]
    tiene = "con_id_sial" if r["id_sial"] else "sin_id_sial"
    dist[(r["estado"], r["sit"], tiene)] += 1

print(f"\n{'Estado':<22} | {'Situación':<22} | {'ID SIAL':<12} | N")
print("-" * 70)
for k, v in sorted(dist.items(), key=lambda x: -x[1]):
    print(f"{k[0]:<22} | {k[1]:<22} | {k[2]:<12} | {v}")

# Mostrar los que tienen id_sial en el Excel (potencialmente recuperables)
recuperables = [(c, excel_map[c]) for c in en_excel if excel_map[c]["id_sial"]]
print(f"\nCon ID SIAL en Excel (recuperables): {len(recuperables)}")
for c, r in recuperables[:10]:
    print(f"  {c}: id_sial={r['id_sial']}, nombre={r['nombre']}, estado={r['estado']}, sit={r['sit']}")

if no_en_excel:
    print(f"\nPrimeros 10 NO en Excel:")
    for c in sorted(no_en_excel)[:10]:
        print(f"  {c}")
