import { z } from 'zod'

// Bool desde query string. z.coerce.boolean() usa Boolean(valor), así que el
// string "false" (no vacío) coerciona a true. Acá solo 'true'/'false' (o un
// boolean real, por si el schema se usa internamente); cualquier otro valor es
// un error de validación. Ausente → undefined.
export const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
