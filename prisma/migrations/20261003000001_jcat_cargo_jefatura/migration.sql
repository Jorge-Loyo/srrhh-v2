-- S22-10: tabla de mapeo JCAT → cargo de jefatura (nivel jerárquico) + seed del
-- mapeo verificado (familias P/G/Z, Doc/Referencias/DOTANEITOR_DECISIONES.md §2.2).
-- El Dotaneitor usa esta tabla (no hardcode) para derivar el cargo de conducción
-- a partir del JCAT. Opción A: cargo_jefatura como texto; cod_puesto (01-06) de
-- referencia para una futura resolución a FK (Opción B).

CREATE TABLE IF NOT EXISTS "jcat_cargo_jefatura" (
  "jcat"           VARCHAR(10)  NOT NULL,
  "cargo_jefatura" VARCHAR(100) NOT NULL,
  "cod_puesto"     VARCHAR(5),
  "familia"        VARCHAR(1)   NOT NULL,
  CONSTRAINT "jcat_cargo_jefatura_pkey" PRIMARY KEY ("jcat")
);

-- Familia P — Conducción CPH de planta (POF), cód. registro 37
INSERT INTO "jcat_cargo_jefatura" ("jcat", "cargo_jefatura", "cod_puesto", "familia") VALUES
  ('P60', 'director',             '01', 'P'),
  ('P61', 'sub-director',         '03', 'P'),
  ('P62', 'jefe de departamento', '02', 'P'),
  ('P63', 'jefe de division',     '04', 'P'),
  ('P64', 'jefe de unidad',       '05', 'P'),
  ('P65', 'jefe de seccion',      '06', 'P'),
-- Familia G — Conducción CPH con guardia (POU/POF), cód. registro 37
  ('G62', 'jefe de departamento', '02', 'G'),
  ('G63', 'jefe de division',     '04', 'G'),
  ('G64', 'jefe de unidad',       '05', 'G'),
  ('G65', 'jefe de seccion',      '06', 'G'),
-- Familia Z — Jefaturas de escalafones NO médicos (cód. registro 83/85/87)
  ('Z22', 'jefe de departamento', NULL, 'Z'),
  ('Z24', 'jefe de division',     NULL, 'Z'),
  ('Z26', 'jefe de seccion',      NULL, 'Z'),
  ('Z32', 'jefe de departamento', NULL, 'Z')
ON CONFLICT ("jcat") DO NOTHING;
