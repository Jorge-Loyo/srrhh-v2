-- Todas las ocupaciones activas del cargo CPH-POF-000062
SELECT p.apellido_nombre, o.situacion_revista, o.hasta
FROM ocupaciones o
JOIN personas p ON p.id = o.persona_id
WHERE o.cargo_id = 'edc12e1f-f88d-47af-af2a-a3df03434052'
  AND o.hasta IS NULL;

-- Todas las ocupaciones activas de Pistoletti (en qué otros cargos está)
SELECT c.codigo, c.id_sial, c.literal_puesto, o.situacion_revista
FROM ocupaciones o
JOIN cargos c ON c.id = o.cargo_id
WHERE o.persona_id = (SELECT id FROM personas WHERE cuil = '20044047250')
  AND o.hasta IS NULL;
