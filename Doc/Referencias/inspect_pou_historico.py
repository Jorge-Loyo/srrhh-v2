import openpyxl

wb = openpyxl.load_workbook(
    'Doc/Referencias/Archivos_semanales/POU_DECRETO 315-22 y modificaciones - HISTORICO.xlsx',
    read_only=False, data_only=True  # read_only=False para ver merged cells
)
ws = wb['ULTIMO ANEXO']

print('=== MERGED CELLS ===')
print(f'  Total: {len(ws.merged_cells.ranges)}')
for mc in list(ws.merged_cells.ranges)[:10]:
    print(f'  {mc}')

print()
print('=== FILAS 1-60 (no vacías) ===')
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=60, values_only=True), 1):
    non_none = [v for v in row if v is not None]
    if non_none:
        # Mostrar solo primeras 8 celdas
        print(f'  row {i:3d}: {list(row[:8])}')

wb.close()
