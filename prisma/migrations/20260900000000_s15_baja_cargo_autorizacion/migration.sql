-- S15: Agregar baja_cargo al enum TipoAutorizacion
-- Permite que las bajas de cargo pasen por el flujo de autorización del director.

ALTER TYPE "TipoAutorizacion" ADD VALUE IF NOT EXISTS 'baja_cargo';
