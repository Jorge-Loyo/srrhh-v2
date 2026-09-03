SELECT e.nombre AS inactivo, e.codigo, COUNT(pc.id) AS puestos,
       STRING_AGG(pc.nombre, ' | ' ORDER BY pc.nombre) AS lista
FROM escalafones e
JOIN puestos_cargo pc ON pc.escalafon_id = e.id
WHERE e.activo = false
GROUP BY e.nombre, e.codigo
ORDER BY puestos DESC;
