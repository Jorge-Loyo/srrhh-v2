BEGIN;

-- Residentes (cod 24) con prefijo CPH → RES
UPDATE cargos SET codigo = 'RES' || SUBSTRING(codigo FROM 4), updated_at = NOW()
WHERE id IN (
  '42a819d3-b6d7-4035-92ba-83d534c868bd',
  '40f62b0c-17e3-4467-9d23-870b1f7ef9bb',
  'e5779465-8687-4bba-99b8-5e16ada06b8e'
);

-- CPH (cod 37) con prefijo RG → CPH
UPDATE cargos SET codigo = 'CPH' || SUBSTRING(codigo FROM 3), updated_at = NOW()
WHERE id = '219b2e0a-e42d-452b-b8e9-b530e7cf6116';

-- 16T con prefijo CARGO → MO
UPDATE cargos SET codigo = 'MO' || SUBSTRING(codigo FROM 6), updated_at = NOW()
WHERE id IN (
  'e75e74b6-9c40-401a-bee0-7c19c9968560',
  '34d77c4f-eb5a-4fcb-9970-648085eabab7',
  'd66fcbe3-7625-4198-abf2-30360a1f5d7a'
);

-- Verificación antes de confirmar
SELECT id, codigo, estado, literal_puesto FROM cargos
WHERE id IN (
  '42a819d3-b6d7-4035-92ba-83d534c868bd',
  '40f62b0c-17e3-4467-9d23-870b1f7ef9bb',
  'e5779465-8687-4bba-99b8-5e16ada06b8e',
  '219b2e0a-e42d-452b-b8e9-b530e7cf6116',
  'e75e74b6-9c40-401a-bee0-7c19c9968560',
  '34d77c4f-eb5a-4fcb-9970-648085eabab7',
  'd66fcbe3-7625-4198-abf2-30360a1f5d7a'
)
ORDER BY codigo;

COMMIT;
