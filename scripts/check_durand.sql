-- Todas las ocupaciones activas del cargo CPH-POF-008656
SELECT p.apellido_nombre, o.situacion_revista, o.hasta
FROM ocupaciones o
JOIN personas p ON p.id = o.persona_id
WHERE o.cargo_id = (SELECT id FROM cargos WHERE id_sial = '001018511-4')
  AND o.hasta IS NULL;
