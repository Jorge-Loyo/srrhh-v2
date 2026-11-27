-- Permisos módulo carga_semanal
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('carga_semanal', 'subir', 'Subir archivos semanales (cargos, bajas, arbol, pou, decreto)'),
  ('carga_semanal', 'ver',   'Ver historial y diffs de cargas semanales')
ON CONFLICT (modulo, accion) DO NOTHING;
