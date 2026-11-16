-- R-8: Crear cargos desde bajas SIAL sin match en ocupaciones
-- Universo: 112 cargos 000xxx cuyo CUIL no tiene ocupación activa en la BD
-- Estado destino: no_vigente (cargo dado de baja, sin ocupante actual)
-- Fuente: baja_sial_registros (último snapshot por cargo)
-- Matching: puesto_cargo_id via LOWER(literal_puesto)+cod_reg, hospital_id via mapeo cod_rep

BEGIN;

-- ============================================================
-- PASO 1: Mapeo cod_rep -> hospital_id
-- Basado en jerarquía de códigos SIAL (prefijo 6 dígitos = hospital)
-- ============================================================
CREATE TEMP TABLE cod_rep_hospital (
  cod_rep   VARCHAR,
  hospital_id UUID
);

INSERT INTO cod_rep_hospital VALUES
-- 402100xx = Gutierrez
('40210021', '339b7231-3a5f-4e03-8f0e-3920013ff032'),
('40210026', '339b7231-3a5f-4e03-8f0e-3920013ff032'),
('40210131', '339b7231-3a5f-4e03-8f0e-3920013ff032'),
('40210240', '339b7231-3a5f-4e03-8f0e-3920013ff032'),
-- 402200xx = Muñiz
('40220000', '73100a11-9950-4659-bfc5-a6dca777656b'),
-- 402201xx = Illia (quemados)
('40220100', 'a506809b-2c54-4df3-ba9a-d511be099278'),
('40220210', 'a506809b-2c54-4df3-ba9a-d511be099278'),
-- 402203xx = Tornu
('40220300', 'e10e4987-c7fe-47c7-b162-d219c4bb8a7c'),
('40220306', 'e10e4987-c7fe-47c7-b162-d219c4bb8a7c'),
-- 402204xx = Alvarez
('40220400', '673b3443-dde1-4db2-9cc8-4373ca4e17c9'),
('40220406', '673b3443-dde1-4db2-9cc8-4373ca4e17c9'),
('40220411', '673b3443-dde1-4db2-9cc8-4373ca4e17c9'),
-- 402205xx = Argerich
('40220500', '8287fa8c-ca66-4b99-a32e-637f5f6976f0'),
('40220519', '8287fa8c-ca66-4b99-a32e-637f5f6976f0'),
-- 402206xx = Durand
('40220606', '91400428-57da-431e-b158-465b83a92796'),
('40220610', '91400428-57da-431e-b158-465b83a92796'),
('40220611', '91400428-57da-431e-b158-465b83a92796'),
('40220619', '91400428-57da-431e-b158-465b83a92796'),
('40220620', '91400428-57da-431e-b158-465b83a92796'),  -- cesac 22 (Durand)
('40220630', '91400428-57da-431e-b158-465b83a92796'),  -- cesac 38 (Durand)
-- 402207xx = Fernandez
('40220700', '61f14dc4-5db2-44ce-889e-b4fb1e30bf7c'),
('40220701', '61f14dc4-5db2-44ce-889e-b4fb1e30bf7c'),
('40220706', '61f14dc4-5db2-44ce-889e-b4fb1e30bf7c'),
-- 402208xx = Piñero
('40220800', 'c6c4a63b-38dc-40b0-95f0-f37f6e88d7c5'),
('40220806', 'c6c4a63b-38dc-40b0-95f0-f37f6e88d7c5'),
('40220811', 'c6c4a63b-38dc-40b0-95f0-f37f6e88d7c5'),
-- 402209xx = Pirovano
('40220900', '13e4d2ef-395b-4f15-a32e-26fd3f8ac31c'),
-- 402210xx = Pirovano (cont.)
('40221011', '13e4d2ef-395b-4f15-a32e-26fd3f8ac31c'),
-- 402211xx = Santojanni
('40221100', '889bd71b-5f30-4739-bff8-4374355ad208'),
('40221181', '889bd71b-5f30-4739-bff8-4374355ad208'),
('40221206', '5c3fffc9-f54f-4a51-acb2-2320e6ba389f'),
('40221208', '5c3fffc9-f54f-4a51-acb2-2320e6ba389f'),
-- 402213xx = Zubizarreta
('40221300', '88a55d65-2a42-4bf2-8153-c6e535f939aa'),
('40221311', '88a55d65-2a42-4bf2-8153-c6e535f939aa'),
-- 402214xx = Penna
('40221400', '87193b73-ec9f-4ba2-8e73-6406736eddba'),
-- 402215xx = Rivadavia
('40221500', '56670232-3271-4168-9bf8-e1f2a93f71ed'),
('40221510', '56670232-3271-4168-9bf8-e1f2a93f71ed'),
('40221551', '56670232-3271-4168-9bf8-e1f2a93f71ed'),
-- 402216xx = Ferrer
('40221600', '11f36737-20b2-4746-864b-782d3707e4a3'),
('40221712', '11f36737-20b2-4746-864b-782d3707e4a3'),
-- 402220xx = Ramos Mejia (aprox)
('40222001', 'cb5207cb-a937-413c-9db1-2dd7a588351d'),
-- 402232xx / 402233xx / 402234xx / 402292xx / 402293xx / 402296xx = sin hospital claro -> SSPSGER
('40223200', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40223300', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40224800', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40229200', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40229400', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40292500', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40293710', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40296211', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40296300', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40296500', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40296600', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
-- 402300xx = Ameghino
('40230000', 'e5bbdfac-4f46-4f82-aec2-da6fd6187bf4'),
('40230007', 'e5bbdfac-4f46-4f82-aec2-da6fd6187bf4'),
('40230050', 'e5bbdfac-4f46-4f82-aec2-da6fd6187bf4'),
-- 402300xx = Moyano
('40230030', '5abd6fd6-f41c-42ff-ba79-2534c145982e'),
-- 402300xx = Tobar Garcia
('40230040', '4b73eab1-ab0c-48a1-8061-b4d023a9660f'),
('40233806', '4b73eab1-ab0c-48a1-8061-b4d023a9660f'),
-- 402400xx = Carrillo (odontologia)
('40240010', '3631e46a-3e84-4e8d-9606-478ca03e0175'),
('40240100', '3631e46a-3e84-4e8d-9606-478ca03e0175'),
-- 402500xx = IRPS
('40250010', '759ec753-aa5b-4b37-8b93-c2137fc7dd91'),
('40252200', '759ec753-aa5b-4b37-8b93-c2137fc7dd91'),
-- 402600xx = Lagleyze
('40260000', '6a1551e6-0889-414f-bd18-d79a3abd216b'),
('40276123', '6a1551e6-0889-414f-bd18-d79a3abd216b'),
-- 409600xx = Pasteur (zoonosis)
('40960000', 'bd617d56-97ee-4f8b-a555-5bf5278d74da'),
-- 400100xx = SSPSGER / SSAPAC
('40010043', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),  -- instituto tecnicaturas -> SSPSGER
('40010100', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),  -- ss planificacion -> SSPSGER
('40011000', '2196d908-311f-4756-bba8-0ab3ab3fa817'),  -- ss atencion primaria -> SSAPAC
-- 402002xx = emergencias -> SSPSGER
('40200030', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40200200', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('40201226', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
-- 412xxx = SSPSGER (cont.)
('41221503', '718427eb-72d5-4553-a8b3-db41ca9c1b64'),
('41230030', '718427eb-72d5-4553-a8b3-db41ca9c1b64');

-- ============================================================
-- PASO 2: Materializar los 112 candidatos con sus FKs resueltas
-- Tomamos el registro más reciente por cargo (max cargo_hasta)
-- ============================================================
CREATE TEMP TABLE bajas_a_crear AS
WITH ultima_baja AS (
  SELECT DISTINCT ON (cargo)
    cargo        AS id_sial_viejo,
    car_codigo,
    cod_rep,
    cod_reg,
    lit_puesto,
    escalafon,
    cargo_hasta,
    doc_resp_baja,
    mot_baja
  FROM baja_sial_registros
  WHERE cargo LIKE '000%'
    AND NOT EXISTS (
      SELECT 1 FROM cuil_ocu co WHERE co.cuil_limpio = REPLACE(cuil, '-', '')
    )
  ORDER BY cargo, cargo_hasta DESC NULLS LAST
)
SELECT
  ub.*,
  crh.hospital_id,
  c.puesto_cargo_id,
  c.escalafon_id,
  c.codigo_registro_id,
  c.especialidad_puesto_id,
  c.agrupador,
  c.unificador_puesto,
  c.regimen,
  c.cod_agrupamiento,
  c.agrupamiento
FROM ultima_baja ub
LEFT JOIN cod_rep_hospital crh ON crh.cod_rep = ub.cod_rep
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (prioridad)
    puesto_cargo_id, escalafon_id, codigo_registro_id,
    especialidad_puesto_id, agrupador, unificador_puesto,
    regimen, cod_agrupamiento, agrupamiento
  FROM (
    -- prioridad 1: match exacto por nombre + cod_reg
    SELECT 1 AS prioridad, puesto_cargo_id, escalafon_id, codigo_registro_id,
      especialidad_puesto_id, agrupador, unificador_puesto, regimen, cod_agrupamiento, agrupamiento
    FROM cargos
    WHERE id_sial IS NOT NULL
      AND codigo_registro_id = (SELECT id FROM codigos_registro WHERE codigo = ub.cod_reg)
      AND LOWER(literal_puesto) = LOWER(ub.lit_puesto)
    UNION ALL
    -- prioridad 2: match sin tildes + cod_reg
    SELECT 2, puesto_cargo_id, escalafon_id, codigo_registro_id,
      especialidad_puesto_id, agrupador, unificador_puesto, regimen, cod_agrupamiento, agrupamiento
    FROM cargos
    WHERE id_sial IS NOT NULL
      AND codigo_registro_id = (SELECT id FROM codigos_registro WHERE codigo = ub.cod_reg)
      AND LOWER(translate(literal_puesto, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
         = LOWER(translate(ub.lit_puesto,  'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
    UNION ALL
    -- prioridad 3: fallback solo por nombre sin tildes (ignora cod_reg incorrecto en baja)
    SELECT 3, puesto_cargo_id, escalafon_id, codigo_registro_id,
      especialidad_puesto_id, agrupador, unificador_puesto, regimen, cod_agrupamiento, agrupamiento
    FROM cargos
    WHERE id_sial IS NOT NULL
      AND LOWER(translate(literal_puesto, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
         = LOWER(translate(ub.lit_puesto,  'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
  ) ranked
  ORDER BY prioridad
  LIMIT 1
) c ON true;

-- Verificar cobertura antes de insertar
SELECT
  COUNT(*) as total,
  COUNT(hospital_id) as con_hospital,
  COUNT(puesto_cargo_id) as con_puesto,
  COUNT(hospital_id) FILTER (WHERE puesto_cargo_id IS NOT NULL) as completos
FROM bajas_a_crear;

-- ============================================================
-- PASO 3: Insertar cargos con estado no_vigente
-- Solo los que tienen hospital_id Y puesto_cargo_id resueltos
-- ============================================================
INSERT INTO cargos (
  id,
  id_sial,
  hospital_id,
  puesto_cargo_id,
  escalafon_id,
  codigo_registro_id,
  especialidad_puesto_id,
  literal_puesto,
  agrupador,
  unificador_puesto,
  regimen,
  cod_agrupamiento,
  agrupamiento,
  estado,
  estado_desde,
  expediente,
  origen,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  NULL,                          -- id_sial NULL: era 000xxx pre-desdoblado, no tiene equivalente 001xxx
  hospital_id,
  puesto_cargo_id,
  escalafon_id,
  codigo_registro_id,
  especialidad_puesto_id,
  lit_puesto,
  agrupador,
  unificador_puesto,
  regimen,
  cod_agrupamiento,
  agrupamiento,
  'no_vigente',
  cargo_hasta,
  doc_resp_baja,
  'baja_sial',
  NOW(),
  NOW()
FROM bajas_a_crear
WHERE hospital_id IS NOT NULL
  AND puesto_cargo_id IS NOT NULL;

-- Reporte final
SELECT
  'insertados' as resultado,
  COUNT(*) as cantidad
FROM cargos
WHERE origen = 'baja_sial'
  AND created_at >= NOW() - INTERVAL '1 minute';

-- Ver los que no pudieron resolverse
SELECT id_sial_viejo, cod_rep, lit_puesto, cod_reg,
  CASE WHEN hospital_id IS NULL THEN 'sin_hospital' ELSE 'ok' END as hospital,
  CASE WHEN puesto_cargo_id IS NULL THEN 'sin_puesto' ELSE 'ok' END as puesto
FROM bajas_a_crear
WHERE hospital_id IS NULL OR puesto_cargo_id IS NULL
ORDER BY id_sial_viejo;

-- ROLLBACK; -- descomentar para dry-run
COMMIT;
