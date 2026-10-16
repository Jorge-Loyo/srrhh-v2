// ─────────────────────────────────────────────────────────────────────────────
// Encabezado estándar de slide del apartado Dotación (S4, S5, …).
// Tag de apartado (badge amarillo, arriba derecha) + antetítulo gris + banda
// navy con el título principal. Tema Obelisco.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  tag: string
  titulo: string
  subtitulo: string
  /** Tercer renglón bajo la banda del título (ej: "Jefes incluidos"). */
  subtitulo2?: string
  /** Marca de agua opcional detrás del tag (ej: "CPH" en la S5). */
  marcaAgua?: string
}

export function SlideHeader({ tag, titulo, subtitulo, subtitulo2, marcaAgua }: Props) {
  return (
    <header className="relative mb-3">
      <div className="absolute right-0 top-0 flex flex-col items-end">
        <span className="pres-halo bg-primary text-black font-extrabold text-xs px-4 py-1.5 rounded uppercase tracking-wide">
          {tag}
        </span>
        {marcaAgua && (
          <span className="font-primary font-extrabold text-gray-200 text-3xl leading-none mt-1 select-none">
            {marcaAgua}
          </span>
        )}
      </div>
      <p className="font-primary font-bold text-gray-500 text-[11px] uppercase tracking-wide mb-1">{titulo}</p>
      <h1 className="inline-block bg-navy text-white font-extrabold text-xl px-4 py-1.5 rounded">
        {subtitulo}
      </h1>
      {subtitulo2 && <p className="text-gray-500 font-semibold text-xs mt-1">{subtitulo2}</p>}
    </header>
  )
}
