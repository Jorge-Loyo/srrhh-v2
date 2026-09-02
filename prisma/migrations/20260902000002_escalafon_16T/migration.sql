-- Agrega escalafón 16T detectado en nueva dotación
INSERT INTO escalafones (id, codigo, nombre, activo, created_at, updated_at)
VALUES (gen_random_uuid(), '16T', 'Plantas Transitorias Modulo Operativo', true, NOW(), NOW())
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO escalafon_codigos_registro (escalafon_id, codigo_reg, literal_orig)
SELECT id, '16T', 'Plantas Transitorias Modulo Operativo'
FROM escalafones WHERE codigo = '16T'
ON CONFLICT (codigo_reg) DO NOTHING;
