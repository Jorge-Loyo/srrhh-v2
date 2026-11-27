import openpyxl

wb = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/POU_DECRETO 315-22 y modificaciones - HISTORICO.xlsx',
    read_only=False, data_only=True
)
ws = wb['ULTIMO ANEXO']

# Buscar patrones: dónde aparece "Dotación Sem" o "semanal"
print('=== FILAS CON "sem" o "semanal" o "SIGLA" (primeras 200 filas) ===')
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=200, values_only=True), 1):
    for v in row:
        if v and isinstance(v, str) and ('sem' in v.lower() or 'sigla' in v.lower() or 'sigla' in str(v).lower()):
            print(f'  row {i:3d}: {list(row[:8])}')
            break

print()
# Ver estructura alrededor de la fila 32 (total del primer hospital)
print('=== FILAS 30-40 (transición entre hospitales) ===')
for i, row in enumerate(ws.iter_rows(min_row=30, max_row=40, values_only=True), 30):
    print(f'  row {i:3d}: {list(row[:8])}')

print()
# Buscar si hay columna de sigla en algún lado
print('=== FILAS CON SIGLA (buscar patrón SIGLA en todo el archivo) ===')
siglas_conocidas = {'HGATA','HGARM','HGAIP','HGAJM','HGAVS','HGAZ','HGAEP','HGADS','HGADC','HGAMD','HGAP','HGAM','HEPTA','HQ','HNRG','HPJIM','HPJIA','HPJIB','HPJIC','HPJID','HPJIE','HPJIF','HPJIG','HPJIH','HPJII','HPJIJ','HPJIK','HPJIL','HPJIM2'}
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=800, values_only=True), 1):
    for v in row:
        if v and str(v).strip() in siglas_conocidas:
            print(f'  row {i:3d}: {list(row[:8])}')
            break

wb.close()
