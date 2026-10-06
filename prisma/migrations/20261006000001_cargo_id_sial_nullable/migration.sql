-- S24: id_sial pasa a ser NULLABLE. Es un dato EXTERNO (identificador del SIAL
-- del gobierno) que el sistema NO inventa — lo trae el padrón. Un cargo de
-- conducción vacante derivado del organigrama (S24-4) no tiene id_sial porque
-- nadie lo ocupa; cuando una persona lo ocupe, el padrón le asigna el real.
-- El índice UNIQUE se mantiene: en Postgres los NULL no colisionan entre sí,
-- así que puede haber N cargos vacantes con id_sial NULL sin violar la unicidad.
ALTER TABLE "cargos" ALTER COLUMN "id_sial" DROP NOT NULL;
