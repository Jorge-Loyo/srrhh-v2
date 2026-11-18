import openpyxl

path = "/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
print("Hojas:", wb.sheetnames)
for sheet in wb.sheetnames:
    ws = wb[sheet]
    print(f"\n=== {sheet} ({ws.max_row} filas x {ws.max_column} cols) ===")
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= 3:
            break
        print(row)
