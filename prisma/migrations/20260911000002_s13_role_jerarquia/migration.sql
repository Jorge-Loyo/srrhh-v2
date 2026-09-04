-- S13-3: Tabla role_jerarquias + seed jerarquía inicial
-- Cimientos para asignación de tareas y permisos en cascada (Sprint 14+).
-- En Sprint 13 solo se crea la tabla y el seed; la lógica de cascada va después.
-- Usa slugs (string) en vez de FKs a roles para consistencia con el resto del sistema.

CREATE TABLE "role_jerarquias" (
  "rol_hijo_slug"  VARCHAR(40) NOT NULL,
  "rol_padre_slug" VARCHAR(40) NOT NULL,
  CONSTRAINT "role_jerarquias_pkey" PRIMARY KEY ("rol_hijo_slug", "rol_padre_slug")
);

-- Jerarquía inicial del sistema:
--   admin
--   └── director
--       ├── editor
--       │   ├── concursales_cph
--       │   └── concursales_ceetps
--       └── sgrasv (si existe)
-- viewer: sin jerarquía (rol de solo lectura transversal)

INSERT INTO "role_jerarquias" ("rol_hijo_slug", "rol_padre_slug") VALUES
  ('director',           'admin'),
  ('editor',             'director'),
  ('concursales_cph',    'editor'),
  ('concursales_ceetps', 'editor')
ON CONFLICT DO NOTHING;

-- sgrasv: si el rol existe en la tabla roles, agregar su jerarquía
INSERT INTO "role_jerarquias" ("rol_hijo_slug", "rol_padre_slug")
SELECT 'sgrasv', 'director'
WHERE EXISTS (SELECT 1 FROM "roles" WHERE slug = 'sgrasv')
ON CONFLICT DO NOTHING;
