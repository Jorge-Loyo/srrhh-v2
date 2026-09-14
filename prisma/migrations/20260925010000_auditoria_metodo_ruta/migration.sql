-- Agrega método HTTP y ruta completa a audit_logs — hallazgo 2026-09-14
-- revisando la pantalla de Auditoría: sin esto, cualquier endpoint de acción
-- de negocio (POST /padron/snapshots/:id/rechazar, /roles/:id/desactivar,
-- etc.) quedaba indistinguible de un alta genérica ("Creación"), porque
-- `accion` solo se resolvía por verbo HTTP + entidad. La app legacy
-- (dotacion-rrhh/app/src/entities-class/AuditLog.ts) sí guardaba `method` y
-- `path` — esta migración cierra esa diferencia. Nullable porque los
-- registros ya existentes no tienen este dato (no se puede reconstruir).
ALTER TABLE "audit_logs" ADD COLUMN "metodo" VARCHAR(10);
ALTER TABLE "audit_logs" ADD COLUMN "ruta" VARCHAR(300);
