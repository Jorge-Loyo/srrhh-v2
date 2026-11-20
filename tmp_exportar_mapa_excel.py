import openpyxl, json, re

wb = openpyxl.load_workbook('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx', read_only=True, data_only=True)
ws = wb['NOMINAL DE CARGOS']
rows = list(ws.iter_rows(values_only=True))
headers = [str(c).strip() if c else '' for c in rows[1]]

idx_codigo   = next(i for i, h in enumerate(headers) if 'digo' in h and 'cargo' in h.lower())
idx_sial_rol = next(i for i, h in enumerate(headers) if 'sial' in h.lower() and 'rol' in h.lower())
idx_bloque   = next((i for i, h in enumerate(headers) if 'bloque' in h.lower()), -1)
idx_estado   = next((i for i, h in enumerate(headers) if h.lower() == 'estado'), -1)

resultado = []
for row in rows[2:]:
    codigo_raw = str(row[idx_codigo] or '').strip()
    sial_rol   = str(row[idx_sial_rol] or '').strip()
    bloque     = str(row[idx_bloque] or '').strip() if idx_bloque >= 0 else ''
    estado     = str(row[idx_estado] or '').strip() if idx_estado >= 0 else ''
    if not codigo_raw:
        continue
    # Normalizar a 6 dígitos
    codigo = re.sub(r'-(\d{5})$', lambda m: '-0' + m.group(1), codigo_raw)
    resultado.append({'codigo': codigo, 'sial_rol_corto': sial_rol, 'bloque': bloque, 'estado': estado})

out = '/mnt/c/Desarrollo/SRH/SRRHH-Legacy/apps/api/scripts/sync-cargos-msgc/_excel_mapa.json'
with open(out, 'w') as f:
    json.dump(resultado, f)
print(f"Exportado {len(resultado)} filas a {out}")
