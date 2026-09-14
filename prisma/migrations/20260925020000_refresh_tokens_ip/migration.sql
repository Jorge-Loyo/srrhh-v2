-- IP de origen del login/refresh que creó esta fila — sin esto, la pantalla
-- de "Sesiones activas" (rediseño 2026-09-14) no tiene forma de distinguir
-- una sesión de otra más allá de la fecha; con IP, un admin puede reconocer
-- "esta sesión no soy yo" antes de cerrarla. Nullable: filas ya existentes no
-- lo tienen.
ALTER TABLE "refresh_tokens" ADD COLUMN "ip" VARCHAR(64);
