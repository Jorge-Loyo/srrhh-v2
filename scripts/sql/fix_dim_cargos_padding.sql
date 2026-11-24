-- Repadear codigo_cargo: CPH-J-P-2315 → CPH-J-P-002315
-- Extrae el prefijo (todo antes del último guión) y el número, reconstruye con lpad a 6 dígitos.
UPDATE dim_cargos
SET codigo_cargo =
  left(codigo_cargo, length(codigo_cargo) - length(split_part(codigo_cargo, '-', -1)))
  || lpad(split_part(codigo_cargo, '-', -1), 6, '0')
WHERE codigo_cargo ~ '-[0-9]{1,5}$';

-- Verificación
SELECT
  count(*) FILTER (WHERE codigo_cargo ~ '-[0-9]{1,5}$') AS sin_padding_restantes,
  count(*) FILTER (WHERE codigo_cargo ~ '-[0-9]{6}$')   AS con_padding_ok,
  count(*)                                               AS total
FROM dim_cargos;
