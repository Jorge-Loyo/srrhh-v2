-- El permiso 'inicio.ver' nunca se sembró en ninguna migración, pero el
-- router (RequireInicio, ver apps/web/src/app/router.tsx) y el sidebar
-- (AppShell.tsx) ya lo usan hace rato para gatear la ruta "/" — como
-- can(user,'inicio','ver') siempre daba false (ni siquiera existía en el
-- catálogo, así que ni admin lo tenía), TODOS los usuarios eran redirigidos
-- de / a /kpis sin excepción. Lo agregamos y lo asignamos a los mismos roles
-- que ya tienen kpis.ver/personas.ver/padron.ver (sgrasv queda afuera a
-- propósito, es un rol acotado a autorizaciones + concursos-cph + dotación).

INSERT INTO permisos (id, modulo, accion, descripcion)
VALUES (gen_random_uuid(), 'inicio', 'ver', 'Ver la pantalla de Inicio')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.slug IN ('admin', 'concursales_ceetps', 'concursales_cph', 'director', 'editor', 'viewer')
  AND p.modulo = 'inicio' AND p.accion = 'ver'
ON CONFLICT DO NOTHING;
