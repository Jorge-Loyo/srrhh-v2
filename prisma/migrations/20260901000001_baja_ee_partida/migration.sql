-- Agrega ee_baja y partida_presupuestaria a la tabla bajas
ALTER TABLE bajas ADD COLUMN IF NOT EXISTS ee_baja VARCHAR(500);
ALTER TABLE bajas ADD COLUMN IF NOT EXISTS partida_presupuestaria VARCHAR(100);
