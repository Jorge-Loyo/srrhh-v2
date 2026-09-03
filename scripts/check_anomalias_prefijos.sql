-- CPH (cod 37) con prefijo RG
\echo '=== CPH (cod 37) con prefijo RG ==='
SELECT c.id, c.codigo, c.estado, c.literal_puesto, h.sigla AS hospital
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN hospitales h ON h.id = c.hospital_id
WHERE cr.codigo = '37' AND c.codigo ILIKE 'RG%';

-- Residentes (cod 24) con prefijo CPH
\echo '=== Residentes (cod 24) con prefijo CPH ==='
SELECT c.id, c.codigo, c.estado, c.literal_puesto, h.sigla AS hospital
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN hospitales h ON h.id = c.hospital_id
WHERE cr.codigo = '24' AND c.codigo ILIKE 'CPH%';

-- 16T con prefijo CARGO
\echo '=== 16T con prefijo CARGO ==='
SELECT c.id, c.codigo, c.estado, c.literal_puesto, h.sigla AS hospital
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
JOIN hospitales h ON h.id = c.hospital_id
WHERE cr.codigo = '16T' AND c.codigo ILIKE 'CARGO%';
