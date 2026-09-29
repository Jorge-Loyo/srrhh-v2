-- NOTA (Sprint 20, 2026-09-30): esta migración agregaba puestos faltantes al
-- seed de 20260901_puestos_cargo (irreproducible desde una base vacía, ver
-- nota en esa migración) — sin efecto útil una vez que ese seed se retiró.
-- El catálogo de puestos se puebla ahora en `prisma/seed.ts` a partir de
-- datos reales (S20-4), que ya incluye los puestos de conducción
-- (Jefe/Director de Sección-Unidad-División-Departamento) que este archivo
-- sembraba a mano. Se deja este archivo vacío (en vez de borrarlo) para no
-- romper el historial de migraciones ya aplicadas en otros entornos.
SELECT 1;
