-- ============================================================================
-- DESDOBLADO DE CARGOS COMPARTIDOS — Residencias (cod_registro '24', prefijo
-- RES-) y Docentes (cod_registro '07', prefijo DOC-).
--
-- PROBLEMA
-- --------
-- El modelo correcto es 1 cargo = 1 rol = 1 persona (como CPH). Hoy, en
-- Residencias y Docentes, UN mismo cargo (un unico `codigo`) es compartido por
-- VARIAS ocupaciones activas simultaneas (hasta IS NULL). Eso es incorrecto:
-- cada rol debe vivir en su propio cargo.
--
-- Magnitud conocida (del usuario, contando por hasta IS NULL SIN filtro de
-- situacion_revista):
--   registro 24 (RES-): 194 cargos multi, 1424 ocupaciones hasta-null, max 42.
--   registro 07 (DOC-): 15  cargos multi, 327  ocupaciones hasta-null, max 112.
--   Maximo actual RES-005253 -> proximo libre RES-005254.
--   Maximo actual DOC-000459 -> proximo libre DOC-000460.
--   Cota SUPERIOR de totales: 209 cargos afectados (194+15); <=1542 cargos nuevos
--   = (1424-194) + (327-15) = 1230 + 312 = 1542.
--   OJO: con el filtro de la REGLA 0 (solo situacion_revista activa), estos
--   numeros BAJAN: los cargos cuyas filas hasta-null NO son activas de verdad
--   (zombie del Bug B) no se desdoblan. Si un cargo queda con una sola activa
--   real, NO se toca. El NOTICE del DO block y A.2/A.5/A.6 dan los numeros reales
--   de CADA base; no los compares con 209/1542 a ciegas: esos son el techo.
--
-- REGLAS DE NEGOCIO (NO cambiar)
-- ------------------------------
-- 0. DEFINICION DE "OCUPACION ACTIVA" (criterio del usuario): una ocupacion
--    cuenta como ACTIVA solo si `hasta IS NULL` Y ADEMAS su situacion_revista
--    es activa: lower(unaccent(situacion_revista)) = 'activo'. El casing/tilde
--    esta mezclado en la BD ('activo'/'Activo'), por eso unaccent+lower (mismo
--    criterio canonico que cadena-mando / areas-programaticas / dotacion.service).
--    MOTIVO: una ocupacion con hasta IS NULL pero situacion_revista NO activa es
--    una "zombie" (baja que el pipeline no cerro) y NO debe recibir cargo nuevo:
--    "de lo contrario es innecesario". Esas zombie NO se desdoblan y NO se tocan
--    (quedan en el cargo original; se exponen en el DRY-RUN A.5 para revision).
-- 1. TITULAR: un rol conserva el `codigo` original. El titular es el id_sial_rol
--    lexicograficamente MENOR entre las ocupaciones ACTIVAS (regla 0) del cargo
--    (min(id_sial_rol)). Determinista; empates imposibles porque
--    ocupaciones.id_sial_rol es UNIQUE.
-- 2. Las ocupaciones CERRADas (hasta IS NOT NULL) y las ZOMBIE (hasta IS NULL
--    pero situacion_revista NO activa) NO se tocan: quedan en el cargo original.
--    Solo se desdoblan las ocupaciones ACTIVAS (regla 0) no-titular.
-- 3. CODIGO NUEVO: autoincremental por prefijo (RES- para 24, DOC- para 07),
--    6 digitos con relleno de ceros, correlativo desde (max numerico existente
--    del prefijo)+1, validando contra TODOS los cargos.codigo de ese prefijo,
--    INCLUYENDO los creados antes en esta misma corrida. Nunca colisiona.
-- 4. El cargo nuevo clona TODAS las columnas fisicas del original EXCEPTO:
--      - id                    -> uuid nuevo (gen_random_uuid())
--      - codigo                -> correlativo nuevo (regla 3)
--      - especialidad_puesto_id-> recomputada por cascada (regla 5)
--      - id_sial               -> NULL (es UNIQUE; el cargo desdoblado es interno,
--                                 no tiene identidad propia en el SIAL; clonar un
--                                 UNIQUE no-nulo seria imposible -> NULL).
--      - created_at / updated_at -> now() (fila nueva).
--    TODO lo demas (codigo_registro_id, puesto_cargo_id, hospital_id,
--    escalafon_id, estado, regimen, descripcion_repa, codigo_repa, etc.) se
--    copia IDENTICO del original.
-- 5. ESPECIALIDAD recomputada por cascada para AMBOS (titular y clones) con la
--    MISMA norm_esp(text) y el patron DISTINCT ON (ph.id_sial_rol) ... ORDER BY
--    fecha_asignada DESC de scripts/fix_especialidad_residencias.sql. La
--    especialidad de cada rol sale de SU PROPIO id_sial_rol en padron_historico
--    (ultima fila con especialidad no vacia), matcheada contra
--    especialidades_puesto del MISMO puesto_cargo_id via
--    norm_esp(ep.nombre) = norm_esp(especialidad_padron).
--    REGLA DE ORO (verbatim): "entre vacio y una especialidad que no corresponde,
--    prefiero vacio" -> si no hay match en el catalogo o el rol no trae
--    especialidad en el padron => especialidad_puesto_id = NULL.
--    NUNCA heredar la especialidad del cargo compartido original.
-- 6. Cada ocupacion desdoblada se repunta (ocupaciones.cargo_id = cargo nuevo).
--    La ocupacion titular queda en el cargo original.
-- 7. Tabla de mapeo persistente `desdoblado_mapeo_cargos`
--    (id_sial_rol text PK, codigo_cargo text, codigo_registro text,
--     created_at timestamptz default now()). Una fila por cada rol activo
--    procesado (titulares Y desdoblados). Idempotente: ON CONFLICT DO NOTHING.
--
-- IDEMPOTENCIA
-- ------------
-- Correr dos veces NO duplica: el loop externo solo toma cargos con >1 ocupacion
-- activa (HAVING count > 1); un cargo ya reducido a una sola activa no re-entra.
-- La tabla de mapeo usa ON CONFLICT (id_sial_rol) DO NOTHING. norm_esp se recrea
-- con CREATE OR REPLACE. Todo APLICAR va en BEGIN; ... COMMIT; (si algo falla,
-- rollback completo).
--
-- USO
-- ---
--   docker compose exec -T postgres psql -U srrhh_user -d srrhh_db \
--     -f scripts/fix_desdoblado_cargos.sql
-- o copiar/pegar una seccion a la vez. Las tres secciones (A DRY-RUN,
-- B APLICAR, C VERIFICACION) estan separadas por banners y son auto-ejecutables
-- por separado. Recomendado: correr (A), validar numeros, luego (B), luego (C).
--
-- COLUMNAS FISICAS de `cargos` clonadas (orden del INSERT = orden del schema):
--   id, id_sial, codigo, hospital_id, escalafon_id, codigo_registro_id,
--   puesto_cargo_id, especialidad_puesto_id, literal_puesto, especialidad_legacy,
--   agrupador, unificador_puesto, regimen, codigo_repa, descripcion_repa,
--   cod_agrupamiento, agrupamiento, puesto_codigo_sial, estado, estado_desde,
--   expediente, fecha_desde, created_by_id, created_at, updated_at, deleted_at,
--   tipo_origen, cargo_retenido_id, cargo_base_id, periodo_desde, periodo_hasta,
--   periodo_renovado, fecha_renovacion, doc_renovacion, cesac_id, unidad_fija_id,
--   origen, revision_dato, revision_motivo.
--   NOT NULL sin default seteados explicitos: hospital_id, escalafon_id,
--   puesto_cargo_id (copiados del original), updated_at (now()).
-- ============================================================================


-- ############################################################################
-- ## SECCION A — DRY-RUN  (SOLO SELECT; NO MODIFICA NADA)                    ##
-- ## Auto-ejecutable. Correr primero y validar los numeros esperados.        ##
-- ############################################################################

-- A.1 — Por cada cargo COMPARTIDO (>1 ocupacion activa) de registros 24/07:
--       codigo, registro, nº de ocupaciones activas, titular (min id_sial_rol),
--       y cuantas se desdoblarian (activas - 1).
SELECT
  c.codigo                         AS cargo_codigo,
  cr.codigo                        AS registro,
  count(o.id)                      AS ocup_activas,
  min(o.id_sial_rol)               AS titular_id_sial_rol,
  count(o.id) - 1                  AS a_desdoblar
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o       ON o.cargo_id = c.id AND o.hasta IS NULL
                        AND lower(unaccent(o.situacion_revista)) = 'activo'  -- regla 0
GROUP BY c.codigo, cr.codigo
HAVING count(o.id) > 1
ORDER BY cr.codigo, ocup_activas DESC
LIMIT 60;

-- A.2 — Totales agregados por registro (esperado 24: 194 cargos / 1424 activas /
--       1230 nuevos ; 07: 15 / 327 / 312).
SELECT
  t.registro,
  count(*)                         AS cargos_multi,
  sum(t.ocup_activas)              AS ocup_activas_totales,
  sum(t.ocup_activas) - count(*)   AS cargos_nuevos_a_crear,
  max(t.ocup_activas)              AS max_en_un_cargo
FROM (
  SELECT c.id, cr.codigo AS registro, count(o.id) AS ocup_activas
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
  JOIN ocupaciones o       ON o.cargo_id = c.id AND o.hasta IS NULL
                          AND lower(unaccent(o.situacion_revista)) = 'activo'  -- regla 0
  GROUP BY c.id, cr.codigo
  HAVING count(o.id) > 1
) t
GROUP BY t.registro
ORDER BY t.registro;

-- A.3 — Proximo codigo libre por prefijo (esperado RES-005254, DOC-000460).
SELECT
  p.prefijo,
  max((substring(c.codigo from 5))::int)                                 AS max_num_actual,
  p.prefijo || lpad((max((substring(c.codigo from 5))::int) + 1)::text, 6, '0') AS proximo_libre
FROM (VALUES ('RES-'), ('DOC-')) AS p(prefijo)
JOIN cargos c
  ON c.codigo LIKE p.prefijo || '%'
 AND substring(c.codigo from 5) ~ '^[0-9]{6}$'
GROUP BY p.prefijo
ORDER BY p.prefijo;

-- A.4 — Muestra de la especialidad que se ASIGNARIA a cada rol activo de los
--       cargos compartidos (match contra su PROPIO padron; NULL si no matchea).
--       Replica la logica de la seccion B (regla 5) en modo SELECT.
WITH compartidos AS (
  SELECT c.id AS cargo_id, c.codigo AS cargo_codigo, c.puesto_cargo_id,
         cr.codigo AS registro, min(o.id_sial_rol) AS titular_rol
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
  JOIN ocupaciones o       ON o.cargo_id = c.id AND o.hasta IS NULL
                          AND lower(unaccent(o.situacion_revista)) = 'activo'  -- regla 0
  GROUP BY c.id, c.codigo, c.puesto_cargo_id, cr.codigo
  HAVING count(o.id) > 1
),
roles_activos AS (
  SELECT cp.cargo_codigo, cp.registro, cp.puesto_cargo_id,
         o.id_sial_rol,
         (o.id_sial_rol = cp.titular_rol) AS es_titular
  FROM compartidos cp
  JOIN ocupaciones o ON o.cargo_id = cp.cargo_id AND o.hasta IS NULL
                    AND lower(unaccent(o.situacion_revista)) = 'activo'  -- regla 0
),
ult_padron AS (
  SELECT DISTINCT ON (ph.id_sial_rol)
         ph.id_sial_rol, ph.especialidad AS esp_raw
  FROM padron_historico ph
  WHERE ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
  ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
)
SELECT
  ra.cargo_codigo,
  ra.registro,
  ra.id_sial_rol,
  ra.es_titular,
  up.esp_raw                       AS especialidad_padron,
  ep.nombre                        AS especialidad_que_se_asignaria  -- NULL => queda vacio (regla de oro)
FROM roles_activos ra
LEFT JOIN ult_padron up ON up.id_sial_rol = ra.id_sial_rol
LEFT JOIN especialidades_puesto ep
       ON ep.puesto_cargo_id = ra.puesto_cargo_id
      AND norm_esp(ep.nombre) = norm_esp(up.esp_raw)
ORDER BY ra.cargo_codigo, ra.es_titular DESC, ra.id_sial_rol
LIMIT 80;
-- NOTA: A.4 usa norm_esp(); si se corre la seccion A sin haber corrido B antes,
-- crear la funcion primero (esta definida al inicio de la seccion B), o
-- ejecutar ese CREATE OR REPLACE FUNCTION suelto. norm_esp es inocua (solo lee).

-- A.5 — ZOMBIE: ocupaciones con hasta IS NULL pero situacion_revista NO activa
--       en cargos de registros 24/07. NO se desdoblan ni se tocan (regla 0/2).
--       Esta query las LISTA para revision: muestra, por cargo, cuantas filas
--       hasta-null tiene en total vs cuantas son activas de verdad. La diferencia
--       (zombie) es lo que el script IGNORA a proposito. Tras APLICAR, estas
--       ocupaciones zombie seguiran con hasta IS NULL en su cargo original y
--       apareceran en la VERIFICACION C.1 si su cargo ademas conserva su titular
--       activo -> es el residuo del Bug B (baja no consumida), a resolver aparte.
SELECT
  c.codigo                                                              AS cargo_codigo,
  cr.codigo                                                             AS registro,
  count(*) FILTER (WHERE o.hasta IS NULL)                               AS hasta_null_total,
  count(*) FILTER (WHERE o.hasta IS NULL
                     AND lower(unaccent(o.situacion_revista)) = 'activo') AS activas_reales,
  count(*) FILTER (WHERE o.hasta IS NULL
                     AND lower(unaccent(o.situacion_revista)) <> 'activo') AS zombie
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o       ON o.cargo_id = c.id AND o.hasta IS NULL
GROUP BY c.codigo, cr.codigo
HAVING count(*) FILTER (WHERE o.hasta IS NULL
                          AND lower(unaccent(o.situacion_revista)) <> 'activo') > 0
ORDER BY zombie DESC, cr.codigo
LIMIT 60;

-- A.6 — Resumen global zombie por registro: total de ocupaciones hasta-null
--       NO activas que el script deja intactas (contexto para dimensionar el
--       residuo del Bug B). Solo informativo.
SELECT
  cr.codigo                                                             AS registro,
  count(*) FILTER (WHERE lower(unaccent(o.situacion_revista)) <> 'activo') AS zombie_total,
  count(*) FILTER (WHERE lower(unaccent(o.situacion_revista)) =  'activo') AS activas_total
FROM cargos c
JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
JOIN ocupaciones o       ON o.cargo_id = c.id AND o.hasta IS NULL
GROUP BY cr.codigo
ORDER BY cr.codigo;


-- ############################################################################
-- ## SECCION B — APLICAR  (TRANSACCIONAL: BEGIN ... COMMIT)                  ##
-- ## Crea mapeo, recomputa especialidad del titular, clona cargos,           ##
-- ## repunta ocupaciones. Idempotente.                                       ##
-- ############################################################################

BEGIN;

-- B.0 — Funcion de normalizacion. OJO: lleva trim() final. Sin el trim, al quitar
-- el parentesis "(...)" queda un espacio de cola ('pediatria ' != 'pediatria') y
-- NO matchea contra el catalogo -> cientos de falsos "sin match" (verificado en
-- 23/24: sin trim daba 624 sin-match, con trim bajo a 17). La version vieja de
-- fix_especialidad_residencias.sql NO tenia trim y arrastraba este bug.
CREATE OR REPLACE FUNCTION norm_esp(txt text) RETURNS text AS $$
  SELECT trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 lower(unaccent(coalesce(txt, ''))),
                 '\([^)]*\)', ' ', 'g'      -- quita "(...)" y su contenido
               ),
               '•', ' ', 'g'                 -- quita el bullet
             ),
             '-', ' ', 'g'                   -- quita guiones
           ),
           '\s+', ' ', 'g'                   -- colapsa espacios
         )) ;
$$ LANGUAGE sql IMMUTABLE;

-- B.1 — Tabla de mapeo persistente (regla 7). Idempotente via IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS desdoblado_mapeo_cargos (
  id_sial_rol     text PRIMARY KEY,
  codigo_cargo    text,
  codigo_registro text,
  created_at      timestamptz DEFAULT now()
);

-- B.2 — Nucleo: desdoblado de cargos compartidos.
DO $$
DECLARE
  r_cargo            RECORD;
  r_ocup             RECORD;
  v_titular_rol      text;
  v_prefijo          text;
  v_next_num         int;
  v_new_codigo       text;
  v_new_cargo_id     uuid;
  v_esp_id           uuid;
  v_cargos_afectados int := 0;
  v_nuevos           int := 0;
BEGIN
  -- Loop externo: cargos de registros 24/07 con >1 ocupacion activa.
  FOR r_cargo IN
    SELECT c.id,
           c.codigo,
           c.puesto_cargo_id,
           cr.codigo               AS reg_codigo,
           min(o.id_sial_rol)      AS titular_rol
    FROM cargos c
    JOIN codigos_registro cr ON cr.id = c.codigo_registro_id AND cr.codigo IN ('24','07')
    JOIN ocupaciones o       ON o.cargo_id = c.id AND o.hasta IS NULL
                            AND lower(unaccent(o.situacion_revista)) = 'activo'  -- regla 0
    GROUP BY c.id, c.codigo, c.puesto_cargo_id, cr.codigo
    HAVING count(o.id) > 1
  LOOP
    v_cargos_afectados := v_cargos_afectados + 1;
    v_titular_rol      := r_cargo.titular_rol;
    v_prefijo          := CASE r_cargo.reg_codigo
                            WHEN '24' THEN 'RES-'
                            WHEN '07' THEN 'DOC-'
                          END;

    -- (a) Recomputar especialidad del TITULAR desde SU propio id_sial_rol
    --     (regla 5). NULL si no hay match (regla de oro). NUNCA hereda.
    SELECT ep.id
      INTO v_esp_id
    FROM (
      SELECT DISTINCT ON (ph.id_sial_rol) ph.especialidad AS esp_raw
      FROM padron_historico ph
      WHERE ph.id_sial_rol = v_titular_rol
        AND ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
      ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
    ) u
    JOIN especialidades_puesto ep
      ON ep.puesto_cargo_id = r_cargo.puesto_cargo_id
     AND norm_esp(ep.nombre) = norm_esp(u.esp_raw)
    LIMIT 1;
    IF NOT FOUND THEN
      v_esp_id := NULL;  -- regla de oro: entre vacio y una especialidad que no corresponde, prefiero vacio
    END IF;

    UPDATE cargos
       SET especialidad_puesto_id = v_esp_id,
           updated_at             = now()
     WHERE id = r_cargo.id;

    -- (b) Mapeo del titular (conserva el codigo original).
    INSERT INTO desdoblado_mapeo_cargos (id_sial_rol, codigo_cargo, codigo_registro)
    VALUES (v_titular_rol, r_cargo.codigo, r_cargo.reg_codigo)
    ON CONFLICT (id_sial_rol) DO NOTHING;

    -- Loop interno: ocupaciones activas NO-titular de este cargo.
    FOR r_ocup IN
      SELECT o.id, o.id_sial_rol
      FROM ocupaciones o
      WHERE o.cargo_id = r_cargo.id
        AND o.hasta IS NULL
        AND lower(unaccent(o.situacion_revista)) = 'activo'  -- regla 0: solo activas
        AND o.id_sial_rol <> v_titular_rol
      ORDER BY o.id_sial_rol
    LOOP
      -- (c) Especialidad del rol del clon desde SU propio id_sial_rol (regla 5).
      SELECT ep.id
        INTO v_esp_id
      FROM (
        SELECT DISTINCT ON (ph.id_sial_rol) ph.especialidad AS esp_raw
        FROM padron_historico ph
        WHERE ph.id_sial_rol = r_ocup.id_sial_rol
          AND ph.especialidad IS NOT NULL AND trim(ph.especialidad) <> ''
        ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
      ) u
      JOIN especialidades_puesto ep
        ON ep.puesto_cargo_id = r_cargo.puesto_cargo_id
       AND norm_esp(ep.nombre) = norm_esp(u.esp_raw)
      LIMIT 1;
      IF NOT FOUND THEN
        v_esp_id := NULL;  -- regla de oro
      END IF;

      -- (d) Proximo codigo correlativo libre del prefijo (regla 3). El max()
      --     incluye los cargos ya insertados en esta misma transaccion.
      SELECT coalesce(max((substring(codigo from 5))::int), 0) + 1
        INTO v_next_num
      FROM cargos
      WHERE codigo LIKE v_prefijo || '%'
        AND substring(codigo from 5) ~ '^[0-9]{6}$';
      v_new_codigo := v_prefijo || lpad(v_next_num::text, 6, '0');
      -- Blindaje defensivo contra huecos/no-contiguos: nunca colisionar.
      WHILE EXISTS (SELECT 1 FROM cargos WHERE codigo = v_new_codigo) LOOP
        v_next_num   := v_next_num + 1;
        v_new_codigo := v_prefijo || lpad(v_next_num::text, 6, '0');
      END LOOP;

      -- (e) Clonar el cargo (regla 4): todas las columnas fisicas salvo id,
      --     id_sial, codigo, especialidad_puesto_id, created_at, updated_at.
      INSERT INTO cargos (
        id, id_sial, codigo, hospital_id, escalafon_id, codigo_registro_id,
        puesto_cargo_id, especialidad_puesto_id, literal_puesto, especialidad_legacy,
        agrupador, unificador_puesto, regimen, codigo_repa, descripcion_repa,
        cod_agrupamiento, agrupamiento, puesto_codigo_sial, estado, estado_desde,
        expediente, fecha_desde, created_by_id, created_at, updated_at, deleted_at,
        tipo_origen, cargo_retenido_id, cargo_base_id, periodo_desde, periodo_hasta,
        periodo_renovado, fecha_renovacion, doc_renovacion, cesac_id, unidad_fija_id,
        origen, revision_dato, revision_motivo
      )
      SELECT
        gen_random_uuid(), NULL, v_new_codigo, hospital_id, escalafon_id, codigo_registro_id,
        puesto_cargo_id, v_esp_id, literal_puesto, especialidad_legacy,
        agrupador, unificador_puesto, regimen, codigo_repa, descripcion_repa,
        cod_agrupamiento, agrupamiento, puesto_codigo_sial, estado, estado_desde,
        expediente, fecha_desde, created_by_id, now(), now(), deleted_at,
        tipo_origen, cargo_retenido_id, cargo_base_id, periodo_desde, periodo_hasta,
        periodo_renovado, fecha_renovacion, doc_renovacion, cesac_id, unidad_fija_id,
        origen, revision_dato, revision_motivo
      FROM cargos
      WHERE id = r_cargo.id
      RETURNING id INTO v_new_cargo_id;

      -- (f) Repuntar la ocupacion al cargo nuevo (regla 6).
      UPDATE ocupaciones
         SET cargo_id   = v_new_cargo_id,
             updated_at = now()
       WHERE id = r_ocup.id;

      -- (g) Mapeo del rol desdoblado (regla 7).
      INSERT INTO desdoblado_mapeo_cargos (id_sial_rol, codigo_cargo, codigo_registro)
      VALUES (r_ocup.id_sial_rol, v_new_codigo, r_cargo.reg_codigo)
      ON CONFLICT (id_sial_rol) DO NOTHING;

      v_nuevos := v_nuevos + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Desdoblado completo: cargos_afectados=%, cargos_nuevos=%',
    v_cargos_afectados, v_nuevos;
  -- Techo esperado: cargos_afectados<=209, cargos_nuevos<=1542. Con el filtro
  -- de situacion_revista activa (regla 0) los numeros reales pueden ser menores
  -- (las ocupaciones zombie hasta-null-no-activas no se cuentan ni desdoblan).
END $$;

-- Revisar el NOTICE anterior. Si los numeros NO coinciden con lo esperado,
-- NO ejecutar COMMIT: correr ROLLBACK y revisar.
COMMIT;


-- ############################################################################
-- ## SECCION C — VERIFICACION  (SOLO SELECT)                                 ##
-- ## Correr DESPUES de B. C.1 DEBE devolver 0 filas.                         ##
-- ############################################################################

-- C.1 — INVARIANTE PRINCIPAL (el que el script GARANTIZA): 0 cargos de registros
--       24/07 con >1 ocupacion ACTIVA (regla 0: hasta IS NULL + situacion_revista
--       activa). ESPERADO: 0 filas.
SELECT cr.codigo AS registro, count(*) AS cargos_con_multi_activa
FROM (
  SELECT o.cargo_id, c.codigo_registro_id, count(*) AS n
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
    AND lower(unaccent(o.situacion_revista)) = 'activo'
  GROUP BY o.cargo_id, c.codigo_registro_id
  HAVING count(*) > 1
) t
JOIN codigos_registro cr ON cr.id = t.codigo_registro_id AND cr.codigo IN ('24','07')
GROUP BY cr.codigo;

-- C.1-bis — INFORMATIVO (NO es un fallo si devuelve filas): cargos de 24/07 con
--       >1 ocupacion hasta-null SIN el filtro de situacion_revista. Si aparecen
--       filas, son cargos donde quedan ZOMBIE (hasta IS NULL no activas) junto al
--       titular activo. El script NO las toca a proposito (regla 0/2); son el
--       residuo del Bug B (baja no consumida) y se resuelven en la tarea aparte
--       del pipeline. Comparar con A.5: deben ser exactamente esas.
SELECT cr.codigo AS registro, count(*) AS cargos_con_multi_hasta_null
FROM (
  SELECT o.cargo_id, c.codigo_registro_id, count(*) AS n
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
  GROUP BY o.cargo_id, c.codigo_registro_id
  HAVING count(*) > 1
) t
JOIN codigos_registro cr ON cr.id = t.codigo_registro_id AND cr.codigo IN ('24','07')
GROUP BY cr.codigo;

-- C.2 — 0 codigos duplicados por prefijo RES-/DOC-. ESPERADO: 0 filas.
SELECT codigo, count(*) AS n
FROM cargos
WHERE codigo LIKE 'RES-%' OR codigo LIKE 'DOC-%'
GROUP BY codigo
HAVING count(*) > 1;

-- C.3 — Filas en la tabla de mapeo por registro (esperado 24: 1424, 07: 327 =
--       una por rol activo procesado).
SELECT codigo_registro, count(*) AS roles_mapeados
FROM desdoblado_mapeo_cargos
GROUP BY codigo_registro
ORDER BY codigo_registro;

-- C.4 — Total de cargos por prefijo (comparar contra el baseline previo:
--       RES- 5253 -> ~6483 ; DOC- 459 -> ~771 ; +1542 en total).
SELECT split_part(codigo, '-', 1) AS prefijo, count(*) AS total_cargos
FROM cargos
WHERE codigo LIKE 'RES-%' OR codigo LIKE 'DOC-%'
GROUP BY split_part(codigo, '-', 1)
ORDER BY prefijo;
