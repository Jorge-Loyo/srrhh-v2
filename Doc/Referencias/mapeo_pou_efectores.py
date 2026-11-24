import openpyxl, unicodedata, re

def normalizar(s):
    if not s: return ''
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s.lower().strip())

# Nombres del POU histórico (detectados antes)
nombres_pou = [
    'Hospital General de Agudos "Dr. Teodoro ÁLVAREZ"',
    'Hospital General de Agudos "José María RAMOS MEJÍA"',
    'Hospital General de Agudos "Dr. Abel ZUBIZARRETA"',
    'Hospital General de Agudos "Dr. Cosme ARGERICH"',
    'Hospital General de Agudos "Dr. Carlos G. DURAND"',
    'Hospital General de Agudos "Dra. Cecilia GRIERSON"',
    'Hospital General de Agudos "Dr. Ignacio PIROVANO"',
    'Hospital General de Agudos "Francisco D. SANTOJANNI"',
    'Hospital General de Agudos "Dr. Juan A. FERNANDEZ"',
    'Hospital General de Agudos "Bernardino RIVADAVIA"',
    'Hospital General de Agudos "José María PENNA"',
    'Hospital General de Agudos "Parmenio PIÑERO"',
    'Hospital General de Agudos "Dr. Enrique TORNÚ"',
    'Hospital General de Agudos "Dalmacio VELEZ SARSFIELD"',
    'Hospital General de Niños "Pedro ELIZALDE"',
    'Hospital General de Niños "Dr. Ricardo GUTIERREZ"',
    'Hospital de Salud Mental "José Tiburcio BORDA"',
    'Hospital Infanto Juvenil "Dra. Carolina TOBAR GARCÍA"',
    'Hospital de Emergencias Psiquiátricas " Dr. Torcuato de ALVEAR"',
    'Hospital de Salud Mental "Dr. Braulio A. MOYANO"',
    'Hospital de Odontología "Ramón CARRILLO"',
    'Hospital de Odontología "Dr. José DUEÑAS"',
    'Hospital de QUEMADOS "DR. ARTURO UMBERTO ILLIA"',
    'Hospital de Odontología Infantil "Don Benito QUINQUELA MARTÍN"',
    'Hospital de Oftalmológico "SANTA LUCÍA"',
    'Hospital Materno Infantil "Ramón SARDÁ"',
    'Hospital de Gastroenterología "Dr. Carlos Bonorino UDAONDO"',
    'Hospital de Rehabilitación Respiratoria "María FERRER"',
    'Hospital de Oncología "María CURIE"',
    'Hospital de Infecciosas "Francisco Javier MUÑIZ"',
]

# dim_efectores (sigla → nombreCompleto)
efectores = {
    'HGATA':  'Hospital General de Agudos Dr. Teodoro Alvarez',
    'HGARM':  'Hospital General de Agudos Jose M. Ramos Mejia',
    'HGAZ':   'Hospital General de Agudos Dr. Abel Zubizarreta',
    'HGACA':  'Hospital General de Agudos Dr. Cosme Argerich',
    'HGACD':  'Hospital General de Agudos Dr. Carlos G. Durand',
    'HGACG':  'Hospital General de Agudos "Dra. Cecilia Grierson"',
    'HGAIP':  'Hospital General de Agudos Dr. Ignacio Pirovano',
    'HGADS':  'Hospital General de Agudos Donacion F. Santojanni',
    'HGAJAF': 'Hospital General de Agudos Dr. Juan A. Fernandez',
    'HBR':    'Hospital General de Agudos Bernardino Rivadavia',
    'HGAP':   'Hospital General de Agudos Jose Maria Penna',
    'HGAPP':  'Hospital General de Agudos Parmenio Piñero',
    'HGAT':   'Hospital General de Agudos Dr. Enrique Tornu',
    'HGAVS':  'Hospital General de Agudos Dalmacio Velez Sarsfield',
    'HGNPE':  'Hospital General de Niños Pedro de Elizalde',
    'HGNRG':  'Hospital General de Niños Dr. Ricardo Gutierrez',
    'HNJTB':  'Hospital de Salud Mental Dr. Jose T. Borda',
    'HIJCTG': 'Hospital Infanto Juvenil Dra. Carolina Tobar Garcia',
    'HEPTA':  'Hospital de Emergencias Psiquiatricas Torcuato de Alvear',
    'HNBM':   'Hospital de Salud Mental Dr. Braulio Moyano',
    'HO':     'Hospital de Odontología Dr. Ramon Carrillo',
    'HMO':    'Hospital de Odontologia Dr. Jose Dueñas',
    'HQ':     'Hospital de Quemados Dr. Arturo Umberto Illia',
    'HOI':    'Hospital de Odontologia Infantil Benito Quinquela Martin',
    'HSL':    'Hospital Oftalmologico Santa Lucia',
    'HMIRS':  'Hospital Materno Infantil Ramon Sarda',
    'HBU':    'Hospital de Gastroenterologia Dr. Carlos Bonorino Udaondo',
    'HRRMF':  'Hospital de Rehabilitacion Respiratoria Maria Ferrer',
    'HMOMC':  'Hospital Municipal de Oncologia Marie Curie',
    'HIFJM':  'Hospital de Enfermedades Infecciosas Francisco J. Muñiz',
}

# Palabras clave para matching fuzzy
def palabras_clave(s):
    s = normalizar(s)
    # Extraer apellidos/palabras significativas (>4 chars, no artículos)
    stop = {'hospital','general','agudos','de','del','la','los','las','el','dr','dra','don','jose','maria','juan'}
    return set(w for w in re.split(r'[\s\"\'\-]+', s) if len(w) > 3 and w not in stop)

print('=== MAPEO POU → SIGLA ===')
sin_match = []
for nombre_pou in nombres_pou:
    kw_pou = palabras_clave(nombre_pou)
    mejor_sigla = None
    mejor_score = 0
    for sigla, nombre_ef in efectores.items():
        kw_ef = palabras_clave(nombre_ef)
        interseccion = kw_pou & kw_ef
        score = len(interseccion)
        if score > mejor_score:
            mejor_score = score
            mejor_sigla = sigla
    if mejor_score >= 1:
        print(f'  ✅ {mejor_sigla:8s} ← "{nombre_pou[:60]}"  (score={mejor_score}, kw={kw_pou & palabras_clave(efectores[mejor_sigla])})')
    else:
        sin_match.append(nombre_pou)
        print(f'  ❌ SIN MATCH ← "{nombre_pou}"')

print()
print(f'Sin match: {len(sin_match)}')
