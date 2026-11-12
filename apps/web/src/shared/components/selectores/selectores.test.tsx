import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComboBuscable } from './ComboBuscable'
import { SelectorCarreraPuestoEspecialidad } from './SelectorCarreraPuestoEspecialidad'

const ops = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
]
const noop = () => {}

describe('ComboBuscable', () => {
  it('múltiple: contador, chips y aria-label', () => {
    const h = renderToStaticMarkup(
      <ComboBuscable label="Puesto" options={ops} selected={['a', 'b']} onChange={noop} placeholder="Buscar…" />,
    )
    expect(h).toContain('(2)')
    expect(h).toContain('aria-label="Quitar Alfa"')
    expect(h).toContain('bg-blue-50')
  })
  it('único: valor en el input y sin chips', () => {
    const h = renderToStaticMarkup(
      <ComboBuscable modo="unico" label="Puesto" options={ops} selected={['b']} onChange={noop} placeholder="Buscar…" requerido />,
    )
    expect(h).toContain('value="Beta"')
    expect(h).not.toContain('bg-blue-50')
    expect(h).not.toContain('(1)')
    expect(h).toContain('text-danger')
  })
  it('disabled', () => {
    const h = renderToStaticMarkup(
      <ComboBuscable label="X" options={ops} selected={[]} onChange={noop} placeholder="p" disabled />,
    )
    expect(h).toContain('disabled')
  })
})

describe('SelectorCarreraPuestoEspecialidad', () => {
  const base = {
    modo: 'multiple' as const,
    valor: { carrera: [], puesto: [], especialidad: [] },
    onChange: noop,
    carreraOpciones: ops,
    puestoOpciones: ops,
    especialidadOpciones: [],
  }
  it('placeholders y labels por defecto', () => {
    const h = renderToStaticMarkup(<SelectorCarreraPuestoEspecialidad {...base} />)
    expect(h).toContain('Buscar carrera…')
    expect(h).toContain('Buscar puesto…')
    expect(h).toContain('Buscar especialidad…')
  })
  it('respeta mostrar y ocultarSiVacio', () => {
    const h = renderToStaticMarkup(
      <SelectorCarreraPuestoEspecialidad {...base} mostrar={{ puesto: false }} ocultarSiVacio={{ especialidad: true }} />,
    )
    expect(h).toContain('Buscar carrera…')
    expect(h).not.toContain('Buscar puesto…')
    expect(h).not.toContain('Buscar especialidad…')
  })
})
