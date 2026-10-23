-- Asigna un CUIL PROVISORIO único a los usuarios que no tienen CUIL todavía y
-- normaliza los emails a minúsculas. Lo corre el USUARIO en Neon DESPUÉS de la
-- migración 20261020000001_usuario_cuil_nombre_apellido (columna cuil + índice
-- único ya existentes). El agente NO lo ejecuta.
--
-- Provisorio = prefijo reservado '00' (ningún CUIL real argentino empieza con
-- 00; los tipos válidos son 20/23/24/27/30/33/34) + correlativo de 9 dígitos.
-- Detectable con: WHERE cuil LIKE '00%'.
--
-- Robusto a re-corridas: el correlativo arranca por encima del MAX provisorio
-- ya asignado, así una segunda pasada tras dar de alta usuarios nuevos sin CUIL
-- no reusa un número existente ni viola el UNIQUE a mitad del UPDATE.
-- Idempotente respecto de filas ya asignadas: solo toca filas con cuil IS NULL.

-- ─────────────────────────────────────────────────────────────────────────
-- PASO OBLIGATORIO 1: normalizar los emails a minúsculas.
-- El login por email usa mode:'insensitive' (no depende del dato), pero este
-- backfill colapsa las filas viejas a lowercase para que el índice @unique y
-- el dato queden consistentes con el lowercasing de alta/edición hacia adelante.
-- Idempotente.
-- PRECONDICIÓN: si este UPDATE fallara por el UNIQUE de `email`, significa que
-- existen DOS filas cuyos emails difieren solo en casing (p. ej. 'A@x' y 'a@x')
-- — son duplicados reales que el usuario debe resolver manualmente antes de
-- continuar (este script no borra ni mergea usuarios).
UPDATE usuarios SET email = lower(email) WHERE email <> lower(email);
-- ─────────────────────────────────────────────────────────────────────────

-- PASO OBLIGATORIO 2: asignar CUIL provisorio a los usuarios sin CUIL.
WITH base AS (
  SELECT COALESCE(MAX((substring(cuil from 3))::int), 0) AS maxn
  FROM usuarios
  WHERE cuil LIKE '00%'
),
pendientes AS (
  SELECT id,
         row_number() OVER (ORDER BY created_at, id) AS n
  FROM usuarios
  WHERE cuil IS NULL
)
UPDATE usuarios u
SET cuil = '00' || LPAD((p.n + b.maxn)::text, 9, '0')
FROM pendientes p, base b
WHERE u.id = p.id;

-- Verificación (debe listar los provisorios asignados, incluido a.losada):
-- SELECT email, cuil FROM usuarios WHERE cuil LIKE '00%' ORDER BY cuil;
