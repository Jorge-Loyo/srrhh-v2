-- ─── Puestos faltantes Art. 6 Ley 6035 — CPH POF ────────────────────────────
INSERT INTO puestos_cargo (escalafon_id, modalidad, nombre) VALUES
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Fisioterapeuta de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Lic. en Estadisticas para la Salud de Planta'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pof', 'Lic. en Comunicacion Social de Planta')
ON CONFLICT DO NOTHING;

-- ─── Puestos faltantes Art. 6 Ley 6035 — CPH POU ────────────────────────────
INSERT INTO puestos_cargo (escalafon_id, modalidad, nombre) VALUES
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Experto en Fisica Radiante de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Lic. en Sistemas de Informacion P/la Salud de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Fisioterapeuta de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Lic. en Estadisticas para la Salud de Guardia'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'pou', 'Lic. en Comunicacion Social de Guardia')
ON CONFLICT DO NOTHING;

-- Mismos puestos para escalafon "Carrera Profesional Hospitalaria"
INSERT INTO puestos_cargo (escalafon_id, modalidad, nombre)
  SELECT '6fa1454a-b739-4d66-a805-fd962e3797bf', modalidad, nombre
  FROM puestos_cargo
  WHERE escalafon_id = '31402d78-f420-4b72-9f69-42f0c0644fca'
    AND nombre IN (
      'Fisioterapeuta de Planta',
      'Lic. en Estadisticas para la Salud de Planta',
      'Lic. en Comunicacion Social de Planta',
      'Experto en Fisica Radiante de Guardia',
      'Lic. en Sistemas de Informacion P/la Salud de Guardia',
      'Fisioterapeuta de Guardia',
      'Lic. en Estadisticas para la Salud de Guardia',
      'Lic. en Comunicacion Social de Guardia'
    )
ON CONFLICT DO NOTHING;

-- ─── Puestos de conduccion CPH — para boton Estructura ───────────────────────
-- Art. 78 Ley 6035: Jefe de Seccion, Jefe de Unidad, Jefe de Division,
-- Jefe de Departamento. Art. 91: Director Medico, Subdirector Medico.
INSERT INTO puestos_cargo (escalafon_id, modalidad, nombre) VALUES
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'ambos', 'Jefe de Seccion (06)'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'ambos', 'Jefe de Unidad (05)'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'ambos', 'Jefe de Division (04)'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'ambos', 'Jefe de Departamento (02)'),
  ('31402d78-f420-4b72-9f69-42f0c0644fca', 'ambos', 'Director (01)')
ON CONFLICT DO NOTHING;

INSERT INTO puestos_cargo (escalafon_id, modalidad, nombre)
  SELECT '6fa1454a-b739-4d66-a805-fd962e3797bf', modalidad, nombre
  FROM puestos_cargo
  WHERE escalafon_id = '31402d78-f420-4b72-9f69-42f0c0644fca'
    AND nombre IN (
      'Jefe de Seccion (06)', 'Jefe de Unidad (05)', 'Jefe de Division (04)',
      'Jefe de Departamento (02)', 'Director (01)'
    )
ON CONFLICT DO NOTHING;
