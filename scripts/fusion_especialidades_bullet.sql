-- ============================================================================
-- Normalización: fusionar especialidades con "• " al inicio contra su gemela
-- limpia (mismo puesto, mismo nombre sin el bullet).
--
-- Las 19 filas con "•" son DUPLICADOS: para cada una existe ya la versión sin
-- "•" en el mismo puesto_cargo_id (verificado). La fusión:
--   1. reapunta los cargos (cargos.especialidad_puesto_id)
--   2. reapunta concursos_cph.especialidad_puesto_solicitada_id
--   3. reapunta solicitudes_alta.especialidad_puesto_id
--   de la especialidad con "•" (viejo) a la limpia (nuevo),
--   4. borra la especialidad con "•".
--
-- NO toca el grupo de la versión limpia (las de "interdisciplinaria..." ya
-- tienen Salud Mental en ambas; las demás quedan como están).
--
-- Mapa de pares (viejo con • -> nuevo limpio), derivado del diagnóstico:
-- ============================================================================

-- Tabla temporal con los pares a fusionar (viejo = con •, nuevo = limpio).
CREATE TEMP TABLE _fusion (viejo uuid, nuevo uuid);
INSERT INTO _fusion (viejo, nuevo) VALUES
  ('d4bc2a49-f625-4c0e-aeef-f378e7b55b98','e4fbde28-ae7b-4f66-834e-2bed3e0d8cad'),
  ('d91998ea-df6d-4b6c-b59e-160234da10cc','6ab15448-2737-49ae-960d-fa2908f7c316'),
  ('90f27646-5790-4716-b0fa-1ff8577e9d9e','aa241ace-a4ef-4c79-9f1e-f5351c5ffddc'),
  ('d80958b4-d34d-495a-be5e-2b0f4cf35050','9366ded4-ac0c-4c74-b7f1-9a1883b77d90'),
  ('f85ce184-4988-403a-8424-1d4a0cfc087d','a1243253-b80a-4030-b192-d8ccb23b28da'),
  ('59a5a46e-78fd-4728-9d46-bb5111b149f9','efbd8517-1c4b-473a-ab3b-9b6e6c394e8c'),
  ('1180645d-a59c-4232-a9e4-75210376b745','be133dec-6ec3-4088-aed7-c521ca0c1550'),
  ('c12497b1-a624-4a90-a4d5-fb0b8102df58','44739c1d-13c0-4a8f-bb4b-3c24c1feba72'),
  ('0b5da770-a2a1-4f53-80bb-e47ef7a6f08c','75ac6377-eca1-422d-ab8f-7d22be37f01e'),
  ('afdb285c-8de1-435b-8b49-06e2bcd57f33','ab139771-f16b-42e8-922c-495ca92edcee'),
  ('8294f273-890a-483e-8239-56143ddcdfe5','51d47ad7-8f16-4d43-af54-528ea09d1cf7'),
  ('5dfdc727-518f-4fe1-9b3c-e2c012319eba','0cdb35dd-5786-4d2d-811d-ac05f4ad69e2'),
  ('66d9541c-8f24-45f7-8e37-71ca9359a650','b56a39af-0f2d-46d2-a906-25bbbb6ee16b'),
  ('067a23a1-fa88-459b-ab4c-02a0c5b49737','959c2246-efa5-40f3-a704-95c3941d5680'),
  ('1cfbf633-6569-4627-906e-268b103c9887','9c659902-5df8-46b3-97e3-3b107b0b554b'),
  ('c19238be-7bd0-4d8f-82c1-464db8f846f4','36a592a3-62a1-4c0e-a468-a93a14abb74b'),
  ('5c60e429-8452-4735-8c66-d1a47843d08d','5d018228-78e9-4143-9baa-ccb1ebb33fed'),
  ('b5dbdf91-a7a7-4fe3-9789-5bcce52743d2','0bc8be35-a881-4ead-a46c-3e6c3a04742f'),
  ('30f557f0-f7b7-4691-a760-a5d4c4259f44','2e178b4d-9e6a-4cbc-b867-3e431c3d4a18');

-- ─── DRY-RUN: cuántas filas se reapuntarían por tabla ───────────────────────
SELECT
  (SELECT count(*) FROM cargos c JOIN _fusion f ON c.especialidad_puesto_id = f.viejo)            AS cargos_a_reapuntar,
  (SELECT count(*) FROM concursos_cph cc JOIN _fusion f ON cc.especialidad_puesto_solicitada_id = f.viejo) AS concursos_a_reapuntar,
  (SELECT count(*) FROM solicitudes_alta sa JOIN _fusion f ON sa.especialidad_puesto_id = f.viejo) AS solicitudes_a_reapuntar,
  (SELECT count(*) FROM _fusion)                                                                    AS especialidades_a_borrar;
