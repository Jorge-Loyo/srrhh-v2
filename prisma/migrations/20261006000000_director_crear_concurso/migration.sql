-- S14-7 (saneamiento): el director resuelve las autorizaciones de alta_cargo
-- (ver resolverPorRolSlug='director' en solicitudes-alta.service.ts) y es
-- quien ve el modal "¿Iniciar concurso?" al aprobarlas (AutorizacionesPage.tsx).
-- Ese modal llama a POST /api/v1/concursos, que exige concursos-cph:crear O
-- concursos-ceetps:crear (concursos.routes.ts) — el rol director tenía
-- concursos-cph:ver/autorizar pero NO :crear en ninguno de los dos módulos,
-- así que el botón "Sí, iniciar concurso" devolvía 403 siempre. Se agregan
-- ambos permisos (idempotente, por slug/módulo/acción, no por id — portable
-- entre entornos que puedan tener distinto UUID para la misma fila lógica).

INSERT INTO role_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.slug = 'director'
  AND ((p.modulo = 'concursos-cph' AND p.accion = 'crear')
    OR (p.modulo = 'concursos-ceetps' AND p.accion = 'crear'))
ON CONFLICT (role_id, permiso_id) DO NOTHING;
