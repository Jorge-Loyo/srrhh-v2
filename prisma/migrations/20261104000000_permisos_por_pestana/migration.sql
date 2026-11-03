-- Permisos granulares POR PESTAÑA (RBAC por sub-componente).
-- Crea un permiso propio `tab:<slug>` por cada pestaña / sub-pestaña de los 5
-- layouts con sub-navegación (Cargos, Bajas, Configuración, Importación,
-- Organigrama), administrable por ROL desde /configuracion/permisos, SIN que
-- ningún rol pierda accesos que hoy tiene.
--
-- Convención: accion = 'tab:<slug>' dentro del modulo DUEÑO del layout que la
-- contiene (ver design.md §2/§3). 19 permisos nuevos en total.
--
-- Todo idempotente (ON CONFLICT DO NOTHING) y envuelto en una única
-- transacción para que corra "todo o nada" en el orden fijo:
--   (a) insertar los 19 permisos
--   (b) grant condicional por rol: cada rol que HOY tiene el permiso genérico
--       gobernante recibe el tab:* equivalente (copia el estado actual 1:1)
--   (b-bis) "Estructura" (hoy acceso abierto) -> a todos los roles
--   (c) admin (esSistema) recibe TODOS los tab:* (defensa en profundidad)
--
-- MANUAL: NO ejecutar con `prisma migrate dev/deploy` (el backend local apunta
-- a Neon producción). El usuario (Jorge) corre este .sql a mano en el deploy.

BEGIN;

-- ── (a) Insertar los 19 permisos de pestaña ────────────────────────────────
INSERT INTO "permisos" ("id", "modulo", "accion", "descripcion") VALUES
  (gen_random_uuid(), 'cargos',        'tab:ver-cargos',          'Ver la pestaña "Ver cargos"'),
  (gen_random_uuid(), 'cargos',        'tab:alta-cargo',          'Ver la pestaña "Alta de cargo"'),
  (gen_random_uuid(), 'cargos',        'tab:baja-cargo',          'Ver la pestaña "Baja de cargo"'),
  (gen_random_uuid(), 'cargos',        'tab:cobertura-vacantes',  'Ver la pestaña "Cobertura de vacantes"'),
  (gen_random_uuid(), 'bajas',         'tab:bajas',               'Ver la pestaña "Bajas"'),
  (gen_random_uuid(), 'bajas',         'tab:validacion',          'Ver la pestaña "Validación"'),
  (gen_random_uuid(), 'bajas',         'tab:vinculaciones',       'Ver la pestaña "Vinculaciones"'),
  (gen_random_uuid(), 'configuracion', 'tab:usuarios',            'Ver la pestaña "Usuarios"'),
  (gen_random_uuid(), 'configuracion', 'tab:tokens',              'Ver la pestaña "Tokens"'),
  (gen_random_uuid(), 'configuracion', 'tab:jerarquia',           'Ver la pestaña "Jerarquía"'),
  (gen_random_uuid(), 'configuracion', 'tab:permisos',            'Ver la pestaña "Permisos"'),
  (gen_random_uuid(), 'configuracion', 'tab:referencias',         'Ver la pestaña "Referencias Dotaneitor"'),
  (gen_random_uuid(), 'configuracion', 'tab:auditoria',           'Ver la pestaña "Auditoría"'),
  (gen_random_uuid(), 'padron',        'tab:padron-semanal',      'Ver la pestaña "Padrón Semanal"'),
  (gen_random_uuid(), 'bajas-sial',    'tab:bajas-consolidadas',  'Ver la pestaña "Bajas Consolidadas"'),
  (gen_random_uuid(), 'configuracion', 'tab:arbol-organigrama',   'Ver la pestaña "Árbol Organigrama"'),
  (gen_random_uuid(), 'configuracion', 'tab:carga-pou',           'Ver la pestaña "Carga POU"'),
  (gen_random_uuid(), 'organigrama',   'tab:estructura',          'Ver la pestaña "Estructura"'),
  (gen_random_uuid(), 'organigrama',   'tab:areas-programaticas', 'Ver la pestaña "Área Programática"')
ON CONFLICT ("modulo", "accion") DO NOTHING;

-- ── (b) Grant condicional por rol (preserva accesos de los no-admin) ────────
-- Para cada pestaña: todo rol que HOY tiene el permiso genérico gobernante
-- recibe el permiso de pestaña nuevo. INSERT ... SELECT cruzando role_permisos
-- existentes => puramente aditivo y data-driven (no depende de qué roles
-- existan). El mapeo (modulo_viejo, accion_vieja, modulo_nuevo, accion_nueva)
-- es la fuente de verdad (design.md §5.1).
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT rp.role_id, p_nuevo.id
FROM (VALUES
  ('cargos',        'ver',                   'cargos',        'tab:ver-cargos'),
  ('cargos',        'crear',                 'cargos',        'tab:alta-cargo'),
  ('bajas',         'crear',                 'cargos',        'tab:baja-cargo'),
  ('bajas',         'crear',                 'cargos',        'tab:cobertura-vacantes'),
  ('bajas',         'crear',                 'bajas',         'tab:bajas'),
  ('bajas',         'crear',                 'bajas',         'tab:validacion'),
  ('bajas',         'crear',                 'bajas',         'tab:vinculaciones'),
  ('configuracion', 'gestionar_usuarios',    'configuracion', 'tab:usuarios'),
  ('configuracion', 'gestionar_usuarios',    'configuracion', 'tab:tokens'),
  ('configuracion', 'gestionar_usuarios',    'configuracion', 'tab:jerarquia'),
  ('configuracion', 'gestionar_permisos',    'configuracion', 'tab:permisos'),
  ('configuracion', 'gestionar_permisos',    'configuracion', 'tab:referencias'),
  ('configuracion', 'ver_auditoria',         'configuracion', 'tab:auditoria'),
  ('padron',        'ver',                   'padron',        'tab:padron-semanal'),
  ('bajas-sial',    'aprobar',               'bajas-sial',    'tab:bajas-consolidadas'),
  ('configuracion', 'gestionar_organigrama', 'configuracion', 'tab:arbol-organigrama'),
  ('configuracion', 'gestionar_pou',         'configuracion', 'tab:carga-pou'),
  ('dotacion',      'ver',                   'organigrama',   'tab:areas-programaticas')
) AS m(mod_viejo, acc_vieja, mod_nuevo, acc_nueva)
JOIN "permisos" p_viejo ON p_viejo.modulo = m.mod_viejo AND p_viejo.accion = m.acc_vieja
JOIN "permisos" p_nuevo ON p_nuevo.modulo = m.mod_nuevo AND p_nuevo.accion = m.acc_nueva
JOIN "role_permisos" rp ON rp.permiso_id = p_viejo.id
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

-- ── (b-bis) "Estructura" (hoy acceso abierto) -> a TODOS los roles ──────────
-- No la gobierna ningún permiso hoy (se muestra a cualquier autenticado), así
-- que se otorga a todos los roles para preservar el acceso abierto y que la
-- grilla la muestre marcada. El acceso real sigue garantizado por código
-- (la ruta /organigrama no lleva RequirePermiso; el tab queda sin `permiso`).
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permisos" p ON p.modulo = 'organigrama' AND p.accion = 'tab:estructura'
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

-- ── (c) admin recibe TODOS los tab:* (defensa en profundidad) ───────────────
-- admin (esSistema, slug='admin') ya pasa por bypass en requirePermiso/can(),
-- así que funcionalmente ve todo sin estas filas; se agregan por consistencia
-- con el seed existente y para que la grilla muestre los 19 checks marcados.
INSERT INTO "role_permisos" ("role_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r.slug = 'admin'
  AND p.accion LIKE 'tab:%'
ON CONFLICT ("role_id", "permiso_id") DO NOTHING;

COMMIT;
