SELECT c.id, c.codigo, c.id_sial,
       p_ret.apellido_nombre AS retenido_por,
       p_act.apellido_nombre AS ocupado_por
FROM ocupaciones o_ret
JOIN ocupaciones o_act ON o_act.cargo_id = o_ret.cargo_id
    AND o_act.persona_id <> o_ret.persona_id
    AND o_act.hasta IS NULL
    AND o_act.situacion_revista = 'Activo'
JOIN cargos c ON c.id = o_ret.cargo_id
JOIN personas p_ret ON p_ret.id = o_ret.persona_id
JOIN personas p_act ON p_act.id = o_act.persona_id
WHERE o_ret.hasta IS NULL
  AND o_ret.situacion_revista = 'Retencion de Cargo'
LIMIT 5;
