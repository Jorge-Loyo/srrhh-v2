import openpyxl, re
from collections import Counter

wb = openpyxl.load_workbook('/mnt/c/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Mapeo de Cargos - MSGC.xlsx', read_only=True, data_only=True)
ws = wb['NOMINAL DE CARGOS']

rows = list(ws.iter_rows(values_only=True))
# fila 2 (idx 1) = encabezados reales
headers = [str(c).strip() if c else '' for c in rows[1]]
idx_codigo = next(i for i, h in enumerate(headers) if 'digo de cargo' in h or 'Codigo de Cargo' in h.replace('ó','o'))

prefijos = Counter()
for row in rows[2:]:
    val = row[idx_codigo]
    if val:
        codigo = str(val).strip()
        # extraer prefijo = todo menos el numero final
        m = re.match(r'^(R-)?(.+)-\d{5}$', codigo)
        if m:
            prefijo = ('R-' if m.group(1) else '') + m.group(2)
        else:
            prefijo = codigo
        prefijos[prefijo] += 1

print(f"Columna codigo: idx={idx_codigo} header='{headers[idx_codigo]}'")
print(f"\nAcrónimos únicos en el Excel ({len(prefijos)}):")
for p, n in sorted(prefijos.items(), key=lambda x: -x[1]):
    print(f"  {p}: {n}")
