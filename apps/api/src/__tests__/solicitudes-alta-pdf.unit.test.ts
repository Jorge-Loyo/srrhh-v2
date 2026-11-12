import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// PDF del GRUPO de solicitudes de alta (unificado por expediente).
//
// generarPdfGrupoSolicitudesAltaService(expediente):
//   - agrupa por expediente (findMany where: { expediente }),
//   - resuelve los códigos de los Cargo ya creados (post-aprobación),
//   - devuelve un Buffer con el PDF (empieza con "%PDF") + un filename,
//   - 404 si el expediente no corresponde a ninguna solicitud.
//
// Se mockea el cliente Prisma: no se toca la base de datos. No se usa headless
// browser — pdfkit genera el PDF en proceso, así que el test corre offline.
// =============================================================================

const solicitudAlta = { findMany: vi.fn() }
const cargo = { findMany: vi.fn() }

vi.mock('../shared/prisma.js', () => ({
  prisma: { solicitudAlta, cargo },
}))

const { generarPdfGrupoSolicitudesAltaService, getGrupoSolicitudesAltaService } =
  await import('../modules/solicitudes-alta/solicitudes-alta.pdf.js')

beforeEach(() => {
  vi.clearAllMocks()
})

// Helper — solicitud del grupo con acentos es-AR para probar el render Latin-1.
function solicitud(over: Record<string, unknown> = {}) {
  return {
    id:               'sa1',
    expediente:       'EX-2026-32260736-GCABA-DGAYDRH',
    literalPuesto:    'Médico de guardia (Cirugía)',
    especialidad:     'Cardiología',
    cantidad:         2,
    estado:           'pendiente',
    desde:            new Date('2026-01-15'),
    createdAt:        new Date('2026-01-10'),
    cargosCreadosIds: [] as string[],
    hospital:         { sigla: 'HGA', nombre: 'Hospital General de Agudos' },
    escalafon:        { nombre: 'Médicos' },
    codigoRegistro:   { literal: '20' },
    solicitadoPor:    { username: 'jorge', email: 'jorge@gcba.gob.ar' },
    ...over,
  }
}

describe('generarPdfGrupoSolicitudesAltaService', () => {
  it('agrupa por expediente y devuelve un Buffer PDF con filename saneado', async () => {
    solicitudAlta.findMany.mockResolvedValue([solicitud(), solicitud({ id: 'sa2', cantidad: 1 })])
    cargo.findMany.mockResolvedValue([])

    const { buffer, filename } = await generarPdfGrupoSolicitudesAltaService(
      'EX-2026-32260736-GCABA-DGAYDRH',
    )

    // Filtra por el expediente pedido.
    expect(solicitudAlta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { expediente: 'EX-2026-32260736-GCABA-DGAYDRH' } }),
    )
    // Es un PDF real (magic bytes "%PDF") con contenido.
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(500)
    expect(filename).toBe('cargos_EX-2026-32260736-GCABA-DGAYDRH.pdf')
  })

  it('sanea barras del expediente (decretos) en el filename', async () => {
    solicitudAlta.findMany.mockResolvedValue([solicitud({ expediente: 'DEC-541/MSGC/26' })])
    cargo.findMany.mockResolvedValue([])

    const { filename } = await generarPdfGrupoSolicitudesAltaService('DEC-541/MSGC/26')
    expect(filename).toBe('cargos_DEC-541_MSGC_26.pdf')
  })

  it('resuelve los códigos de los Cargo ya creados (solicitud aprobada)', async () => {
    solicitudAlta.findMany.mockResolvedValue([
      solicitud({ estado: 'aprobada', cargosCreadosIds: ['cargo-1', 'cargo-2'] }),
    ])
    cargo.findMany.mockResolvedValue([
      { id: 'cargo-1', codigo: 'CPH-POU-000056' },
      { id: 'cargo-2', codigo: 'CPH-POU-000057' },
    ])

    const { buffer } = await generarPdfGrupoSolicitudesAltaService('EX-2026-32260736-GCABA-DGAYDRH')

    // Pide los códigos de los cargos creados del grupo.
    expect(cargo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['cargo-1', 'cargo-2'] } } }),
    )
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('un expediente inexistente lanza 404', async () => {
    solicitudAlta.findMany.mockResolvedValue([])

    await expect(generarPdfGrupoSolicitudesAltaService('NO-EXISTE'))
      .rejects.toMatchObject({ statusCode: 404 })
    // No intenta resolver cargos si no hay solicitudes.
    expect(cargo.findMany).not.toHaveBeenCalled()
  })
})

describe('getGrupoSolicitudesAltaService', () => {
  it('devuelve las solicitudes del grupo ordenadas por creación', async () => {
    const data = [solicitud(), solicitud({ id: 'sa2' })]
    solicitudAlta.findMany.mockResolvedValue(data)

    const result = await getGrupoSolicitudesAltaService('EX-2026-32260736-GCABA-DGAYDRH')

    expect(solicitudAlta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    )
    expect(result).toHaveLength(2)
  })

  it('404 si el grupo está vacío', async () => {
    solicitudAlta.findMany.mockResolvedValue([])
    await expect(getGrupoSolicitudesAltaService('NADA'))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
