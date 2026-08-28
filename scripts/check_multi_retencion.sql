SELECT p.apellido_nombre, p.cuil, COUNT(*) AS retenidos
FROM ocupaciones o
JOIN personas p ON p.id = o.persona_id
WHERE o.hasta IS NULL AND o.situacion_revista = 'Retencion de Cargo'
GROUP BY p.id, p.apellido_nombre, p.cuil
HAVING COUNT(*) > 1
ORDER BY retenidos DESC
LIMIT 10;
