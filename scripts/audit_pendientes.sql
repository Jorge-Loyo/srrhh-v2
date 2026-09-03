-- Puestos existentes por escalafón activo
SELECT e.nombre AS escalafon,
       COUNT(pc.id) AS puestos_existentes
FROM escalafones e
LEFT JOIN puestos_cargo pc ON pc.escalafon_id = e.id
WHERE e.activo = true
GROUP BY e.nombre
ORDER BY puestos_existentes ASC, e.nombre;
