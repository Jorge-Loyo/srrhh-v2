import openpyxl

# POU HISTORICO - ULTIMO ANEXO: buscar donde empieza la data real
wb = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/POU_DECRETO 315-22 y modificaciones - HISTORICO.xlsx',
    read_only=True, data_only=True
)
ws = wb['ULTIMO ANEXO']
print('=== POU HISTORICO - ULTIMO ANEXO (filas 1-20) ===')
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=20, values_only=True), 1):
    non_none = [v for v in row if v is not None]
    if non_none:
        print(f'  row {i}: {row[:10]}')
wb.close()

print()

# Ocupacion_POU - hoja Base: ver columnas completas
wb2 = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/Ocupacion_POU_16-11.xlsx',
    read_only=True, data_only=True
)
ws2 = wb2['Base']
print('=== Ocupacion_POU - Base (primeras 5 filas) ===')
for i, row in enumerate(ws2.iter_rows(min_row=1, max_row=5, values_only=True), 1):
    print(f'  row {i}: {row}')

print()
ws3 = wb2['OC Pou Detalle']
print('=== Ocupacion_POU - OC Pou Detalle (primeras 4 filas) ===')
for i, row in enumerate(ws3.iter_rows(min_row=1, max_row=4, values_only=True), 1):
    print(f'  row {i}: {row}')
wb2.close()
