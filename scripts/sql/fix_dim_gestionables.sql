BEGIN;
DELETE FROM dim_gestionables WHERE codigo_registro = '24';
UPDATE dim_gestionables SET tipo_concurso = 'CPH'    WHERE codigo_registro = '23';
UPDATE dim_gestionables SET tipo_concurso = 'CEETPS', regimen_override = 'escalafon genera anexo 2' WHERE codigo_registro = '83';
UPDATE dim_gestionables SET regimen_override = 'CEETPS' WHERE codigo_registro = '85';
COMMIT;
SELECT codigo_registro, tipo_concurso, regimen_override, activo FROM dim_gestionables ORDER BY codigo_registro;
