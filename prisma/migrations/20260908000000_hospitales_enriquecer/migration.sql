-- Enriquecer tabla hospitales con universo_totalizador, tipo y monovalencia
-- Fuente: tabla siglas de dotacion-rrhh

-- ── UPDATE registros existentes ──────────────────────────────────────────────
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Hospitalaria',                           monovalencia = NULL               WHERE sigla = 'CSMA';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Administración de Salud',                         monovalencia = NULL               WHERE sigla = 'DGACSA';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Administración de Salud',                         monovalencia = NULL               WHERE sigla = 'DGADCYP';
UPDATE hospitales SET universo_totalizador = 'APS',            tipo = 'SS Atención Primaria / Cesacs y Áreas Programáticas', monovalencia = NULL               WHERE sigla = 'DGATP';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Administración de Salud',                         monovalencia = NULL               WHERE sigla = 'DGAYDRH';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'DGCOR';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'DGCRFS';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'Unidad de Ministro',                                 monovalencia = NULL               WHERE sigla = 'DGCSJ';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'DGDIYDP';
UPDATE hospitales SET universo_totalizador = 'SAME',           tipo = 'SAME',                                               monovalencia = NULL               WHERE sigla = 'DGESAME';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'DGGECDSPS';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Hospitalaria',                           monovalencia = NULL               WHERE sigla = 'DGHOSP';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'Unidad de Ministro',                                 monovalencia = NULL               WHERE sigla = 'DGLTMSGC';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Administración de Salud',                         monovalencia = NULL               WHERE sigla = 'DGRFISS';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Hospitalaria',                           monovalencia = NULL               WHERE sigla = 'DGSAM';
UPDATE hospitales SET universo_totalizador = 'APS',            tipo = 'SS Atención Primaria / Cesacs y Áreas Programáticas', monovalencia = NULL               WHERE sigla = 'DGSCOM';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'DGSISAN';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Hospitalaria',                           monovalencia = 'Trasplantes'      WHERE sigla = 'EAIT';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HBR';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Gastroenterología' WHERE sigla = 'HBU';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Salud Mental',                         monovalencia = 'Psiquiátrico'     WHERE sigla = 'HEPTA';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGACA';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGACD';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGACG';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGADS';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAIP';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAJAF';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAP';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAPP';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGARM';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAT';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGATA';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAVS';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Agudos',                               monovalencia = NULL               WHERE sigla = 'HGAZ';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Niños',                                monovalencia = NULL               WHERE sigla = 'HGNPE';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Niños',                                monovalencia = NULL               WHERE sigla = 'HGNRG';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Infectología'     WHERE sigla = 'HIFJM';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Salud Mental',                         monovalencia = 'Infanto Juvenil'  WHERE sigla = 'HIJCTG';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Maternidad'       WHERE sigla = 'HMIRS';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Odontología'      WHERE sigla = 'HMO';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Oncología'        WHERE sigla = 'HMOMC';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Salud Mental',                         monovalencia = 'Femenino'         WHERE sigla = 'HNBM';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales de Salud Mental',                         monovalencia = 'Masculino'        WHERE sigla = 'HNJTB';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Odontología'      WHERE sigla = 'HO';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Odontología Infantil' WHERE sigla = 'HOI';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Oftalmología'     WHERE sigla = 'HOPL';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Quemados'         WHERE sigla = 'HQ';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Rehabilitación'   WHERE sigla = 'HRR';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Rehabilitación Respiratoria' WHERE sigla = 'HRRMF';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Oftalmología'     WHERE sigla = 'HSL';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Rehabilitación'   WHERE sigla = 'IRPS';
UPDATE hospitales SET universo_totalizador = 'Hospitales',     tipo = 'Hospitales Monovalentes',                            monovalencia = 'Zoonosis'         WHERE sigla = 'IZLP';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'Unidad de Ministro',                                 monovalencia = NULL               WHERE sigla = 'MSGC';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Hospitalaria',                           monovalencia = NULL               WHERE sigla = 'SSAH';
UPDATE hospitales SET universo_totalizador = 'APS',            tipo = 'SS Atención Primaria / Cesacs y Áreas Programáticas', monovalencia = NULL               WHERE sigla = 'SSAPAC';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Administración de Salud',                         monovalencia = NULL               WHERE sigla = 'SSASS';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'SSPSGER';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Hospitalaria',                           monovalencia = NULL               WHERE sigla = 'TPRPS';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'Unidad de Ministro',                                 monovalencia = NULL               WHERE sigla = 'UAIMS';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Planificación Sanitaria',                         monovalencia = NULL               WHERE sigla = 'UPETDESRHCE';
UPDATE hospitales SET universo_totalizador = 'Nivel Central',  tipo = 'SS Atención Primaria',                               monovalencia = NULL               WHERE sigla = 'URO';

-- ── INSERT registros en dotacion-rrhh que no están en Postgres ───────────────
INSERT INTO hospitales (id, sigla, nombre, universo_totalizador, tipo, monovalencia, activo, created_at, updated_at) VALUES
  (gen_random_uuid(), 'DGABS',     'DGABS',     'Nivel Central', 'SS Administración de Salud',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCAPM',    'DGCAPM',    'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCOECSSP', 'DGCOECSSP', 'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCTF',     'DGCTF',     'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCTFS',    'DGCTFS',    'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGCVPM',    'DGCVPM',    'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGPAPM',    'DGPAPM',    'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGPLO',     'DGPLO',     'Nivel Central', 'SS Planificación Sanitaria',  NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'DGPSB',     'DGPSB',     'Bienestar',     'SECR Bienestar',               NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'IREP',      'IREP',      'Hospitales',    'Hospitales Monovalentes',      'Rehabilitación', true, NOW(), NOW()),
  (gen_random_uuid(), 'SECBI',     'SECBI',     'Bienestar',     'SECR Bienestar',               NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'SSPPM',     'SSPPM',     'Bienestar',     'SS Personas Mayores',          NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'UPERICPSM', 'UPERICPSM', 'Nivel Central', 'SS Atención Hospitalaria',    NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'UPESCA',    'UPESCA',    'Nivel Central', 'SS Atención Primaria',         NULL,             true, NOW(), NOW()),
  (gen_random_uuid(), 'UPECСJ',    'UPECСJ',    'Nivel Central', 'Unidad de Ministro',           NULL,             true, NOW(), NOW())
ON CONFLICT (sigla) DO NOTHING;
