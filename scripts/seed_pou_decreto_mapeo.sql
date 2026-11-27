-- Seed: mapeo nombre POU histórico → sigla dim_efectores
-- Siglas verificadas contra dim_efectores (check-efectores4.mjs)
-- Hospitales de convenio (Cetrángolo, Paroissien, Meléndez, Aneiros, Fiorito)
-- no existen en dim_efectores — omitidos intencionalmente.

INSERT INTO pou_decreto_mapeo_hospital (nombre_pou, sigla) VALUES
  ('HOSPITAL GENERAL DE AGUDOS "DR. COSME ARGERICH"',           'HGACA'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. JUAN A. FERNANDEZ"',        'HGAJAF'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. JOSE M. RAMOS MEJIA"',      'HGARM'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. TEODORO ALVAREZ"',          'HGATA'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. CARLOS G. DURAND"',         'HGACD'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. ENRIQUE TORNÚ"',            'HGAT'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. IGNACIO PIROVANO"',         'HGAIP'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. JOSE MARIA PENNA"',         'HGAP'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. ABEL ZUBIZARRETA"',         'HGAZ'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. BERNARDINO RIVADAVIA"',     'HBR'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. PARMENIO PIÑERO"',          'HGAPP'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. FRANCISCO SANTOJANNI"',     'HGADS'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. DONATO ALVAREZ"',           'HEPTA'),
  ('HOSPITAL GENERAL DE NIÑOS "DR. PEDRO DE ELIZALDE"',         'HGNPE'),
  ('HOSPITAL GENERAL DE NIÑOS "DR. RICARDO GUTIERREZ"',         'HGNRG'),
  ('HOSPITAL DE ODONTOLOGÍA "DR. RAMÓN CARRILLO"',              'HO'),
  ('HOSPITAL DE ONCOLOGÍA "MARÍA CURIE"',                       'HMOMC'),
  ('HOSPITAL DE REHABILITACIÓN "DR. MANUEL ROCCA"',             'HRR'),
  ('HOSPITAL DE SALUD MENTAL "DR. BRAULIO MOYANO"',             'HNBM'),
  ('HOSPITAL DE SALUD MENTAL "DR. JOSE T. BORDA"',              'HNJTB'),
  ('HOSPITAL OFTALMOLÓGICO "DR. PEDRO LAGLEYZE"',               'HOPL'),
  ('HOSPITAL DE QUEMADOS',                                      'HQ'),
  ('HOSPITAL MATERNO INFANTIL "RAMÓN SARDÁ"',                   'HMIRS'),
  ('HOSPITAL GENERAL DE AGUDOS "DR. DALMACIO VELEZ SARSFIELD"', 'HGAVS')
ON CONFLICT (nombre_pou) DO UPDATE SET sigla = EXCLUDED.sigla;
