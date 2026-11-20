import openpyxl
from collections import defaultdict

wb = openpyxl.load_workbook('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx', read_only=True, data_only=True)
ws = wb['NOMINAL DE CARGOS']

rows = list(ws.iter_rows(values_only=True))
headers = [str(c).strip() if c else '' for c in rows[1]]

# Encontrar columnas
def find_col(keyword):
    for i, h in enumerate(headers):
        if keyword.lower() in h.lower():
            return i
    return -1

idx_codigo = find_col('digo de cargo')
idx_sial_rol = find_col('ID SIAL Rol')
idx_bloque = find_col('Bloque')
idx_estado = find_col('Estado')

print(f"Columnas: codigo={idx_codigo}, sial_rol={idx_sial_rol}, bloque={idx_bloque}, estado={idx_estado}")

# Los id_sial_rol del sistema usan formato largo: legajo-rol-cuil-rol
# El Excel usa formato corto: legajo-rol (primeros dos segmentos)
def corto(sial_rol_largo):
    partes = sial_rol_largo.split('-')
    return '-'.join(partes[:2]) if len(partes) >= 2 else sial_rol_largo

casos = {
    'TEC-001265': ['001059259-2-27149122309-2', '001060657-1-27163531939-1', '001061380-2-27165827878-2', '001687876-1-27286938642-1', '001687932-1-20337858806-1'],
    'CPH-P-010553': ['001065239-1-27178287015-1', '001198479-1-20326778312-1', '001692309-4-20397734081-4', '001734917-4-23407469704-4'],
    'EG-004892': ['001706131-2-27331548699-2', '001708953-2-27403848528-2', '001710551-3-20389749770-3'],
}

# Construir mapa id_sial_rol_corto -> fila del Excel
mapa = {}
for row in rows[2:]:
    sial = str(row[idx_sial_rol] or '').strip()
    codigo = str(row[idx_codigo] or '').strip()
    bloque = str(row[idx_bloque] or '').strip() if idx_bloque >= 0 else ''
    estado = str(row[idx_estado] or '').strip() if idx_estado >= 0 else ''
    if sial:
        mapa[sial] = {'codigo': codigo, 'bloque': bloque, 'estado': estado}

# Buscar si los codigos de cargo estan en el Excel
codigos_buscar = ['TEC-001265', 'CPH-P-010553', 'EG-004892', 'TEC-002716', 'TEC-003410', 'SGAII-001710', 'CPH-P-010746', 'TEC-000654', 'ENF-012211', 'EG-004795', 'CPH-P-010929', 'CPH-P-010689']

# Mapa codigo -> fila del Excel
mapa_codigo = {}
for row in rows[2:]:
    codigo = str(row[idx_codigo] or '').strip()
    sial = str(row[idx_sial_rol] or '').strip()
    bloque = str(row[idx_bloque] or '').strip() if idx_bloque >= 0 else ''
    estado = str(row[idx_estado] or '').strip() if idx_estado >= 0 else ''
    if codigo:
        # El Excel usa 5 digitos, el sistema usa 6 — normalizar
        codigo6 = __import__('re').sub(r'-(\d{5})$', lambda m: '-0'+m.group(1), codigo)
        mapa_codigo[codigo6] = {'sial_rol': sial, 'bloque': bloque, 'estado': estado, 'codigo_excel': codigo}

print('\nCodigos de cargo en el Excel:')
for cod in codigos_buscar:
    fila = mapa_codigo.get(cod)
    if fila:
        print(f'  {cod} → sial_rol={fila["sial_rol"]} bloque={fila["bloque"]} estado={fila["estado"]}')
    else:
        print(f'  {cod} → NO ESTA en el Excel')

print()
for cargo, sial_rols in casos.items():
    print(f"\n{cargo}:")
    for sr_largo in sial_rols:
        sr = corto(sr_largo)
        fila = mapa.get(sr)
        if fila:
            print(f"  {sr} → codigo={fila['codigo']} bloque={fila['bloque']} estado={fila['estado']}")
        else:
            print(f"  {sr} → NO ENCONTRADO en el Excel")
