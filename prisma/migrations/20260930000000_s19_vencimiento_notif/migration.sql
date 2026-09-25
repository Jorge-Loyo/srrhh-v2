-- Sprint 19 — nuevo tipo de notificación para el vencimiento de períodos de
-- conducción (cargos TTR / jefaturas). Alimenta materializarAlertasVencimiento().
ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'vencimiento_conduccion';
