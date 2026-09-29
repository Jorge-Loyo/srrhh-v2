-- NOTA (Sprint 20, 2026-09-30): esta migración corregía a mano el seed de
-- especialidades de 20260902_especialidades_puesto (irreproducible desde una
-- base vacía, ver nota en esa migración) — sin efecto útil una vez que ese
-- seed se retiró. El catálogo de especialidades se puebla ahora en
-- `prisma/seed.ts` a partir de datos reales (S20-4). Se deja este archivo
-- vacío (en vez de borrarlo) para no romper el historial de migraciones ya
-- aplicadas en otros entornos.
SELECT 1;
