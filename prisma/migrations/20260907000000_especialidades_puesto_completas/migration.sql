-- NOTA (Sprint 20, 2026-09-30): esta migración completaba el seed de
-- especialidades (irreproducible desde una base vacía, ver nota en
-- 20260901_puestos_cargo/migration.sql) — sin efecto útil una vez que ese
-- seed se retiró. El catálogo de especialidades se puebla ahora en
-- `prisma/seed.ts` a partir de datos reales (S20-4). Se deja este archivo
-- vacío (en vez de borrarlo) para no romper el historial de migraciones ya
-- aplicadas en otros entornos.
SELECT 1;
