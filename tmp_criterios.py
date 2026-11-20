import openpyxl
wb = openpyxl.load_workbook('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx', read_only=True, data_only=True)
ws = wb['Criterios']
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if any(c is not None for c in row):
        print(f"Fila {i+1}: {[str(c) if c is not None else '' for c in row]}")
