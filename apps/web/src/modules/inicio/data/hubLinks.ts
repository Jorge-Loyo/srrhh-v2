// Contenido real portado de dotacion-rrhh/frontend/public/landing.html (legacy) —
// nombres, URLs y "acceso" tal cual, sin datos inventados. Actualizado: Agosto 2026
// (misma fecha que decía el legacy al momento de portar).

export interface HubItem {
  nombre: string
  url: string
  acceso: string
}

export interface HubCategoria {
  titulo: string
  items: HubItem[]
}

export const HUB_PLANILLAS: HubCategoria[] = [
  {
    titulo: 'DOTACIONES',
    items: [
      { nombre: 'CARPETA DOTACIONES', url: 'https://drive.google.com/drive/folders/1_JoFln0otDF3UvpxGbXhIBU4cof-pb_M', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'CARPETA OCUPACIONES POU', url: 'https://drive.google.com/drive/u/0/folders/1DXSIT25G8Ydtjb9KySbFyOGfzzl6yfxD', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'ANALISIS DECRETO 315 Y MODIFICACIONES', url: 'https://docs.google.com/spreadsheets/d/1ctT05nMqLAoGOSg2AxIzVhKRVzQy1zenh0W4SOe-ABE/edit?gid=141441799#gid=141441799', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'CIERRE ESTUDIO DE DOTACIÓN', url: 'https://docs.google.com/spreadsheets/d/1VVMFCrYjYGnLOMCYOTLCTO1d04ylZbg_YfMpACScdTQ/edit?gid=500945592#gid=500945592', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'ANÁLISIS TRANSF/COMISIONES', url: 'https://docs.google.com/spreadsheets/d/1_uO8n3CpLGLD0L4LiX3T9BvbmAWVk49ZViUFiJUZqKY/edit?gid=834384433#gid=834384433', acceso: 'SGOGPDS - Equipo Ana' },
      { nombre: 'TRAMITACIONES Y PEDIDOS VARIOS', url: 'https://docs.google.com/spreadsheets/d/1erncrVBeaJXjzQnKGMtKPFI00b1nKYxI54BGuef0ERM/edit?usp=sharing', acceso: 'SGOGPDS - Equipo Ana' },
      { nombre: 'ESTUDIO DOTACIÓN ENFERMERÍA', url: 'https://docs.google.com/spreadsheets/d/1WBCVmspKPi00CeKYRt0TjRsA1hZApFoDpSrDp5aBAqY/edit?gid=262430128#gid=262430128', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'AUTORIDADES DE HOSPITALES', url: 'https://docs.google.com/spreadsheets/d/1zNx08nviCoyWyohcKq6qN3si7j4nrkvremZpnX0p94U/edit?gid=1617849560#gid=1617849560', acceso: 'Equipo Datos GOPLYCO' },
    ],
  },
  {
    titulo: 'BAJAS Y SEGUIMIENTO CONCURSOS',
    items: [
      { nombre: 'BAJAS CONSOLIDADAS', url: 'https://docs.google.com/spreadsheets/d/1dS-kgxYrAfx5Z58myLxpGQ2v0RsstX9RJQqKsGgdCu4/edit?gid=0#gid=0', acceso: 'SGORASV - Ale' },
      { nombre: 'SEGUIMIENTO CONCURSOS CPH', url: 'https://docs.google.com/spreadsheets/d/1h9X_JoibGiJQsmLd4alq-c7B_wXIavXKW5970VHB7SE/edit?gid=694073484#gid=694073484', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'SGO CONCURSOS - CEETPS', url: 'https://docs.google.com/spreadsheets/d/1I9GGCGLTjJpkscG39iBVx8u68gfcR6ose8RKaXuxzpQ/edit?gid=1386854709#gid=1386854709', acceso: 'SGOGCETA - Equipo Laura Zárate' },
      { nombre: 'APTOS MEDICOS - CPH/CEETPS/DGAMT', url: 'https://docs.google.com/spreadsheets/d/1e30WzH3__R5pZzXId9HECv4YO7P3pmbBaKF9XZsd3-U/edit?gid=1632575893#gid=1632575893', acceso: 'Equipo Datos GOPLYCO' },
    ],
  },
  {
    titulo: 'OBRAS Y RECORRIDAS',
    items: [
      { nombre: 'OBRAS', url: 'https://docs.google.com/spreadsheets/d/1VcuyHkZVJn7RD-l6xZ70fgBtq_ILpahxhYs7g7hA7Ew/edit?gid=636602511#gid=636602511', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'RECORRIDAS', url: 'https://drive.google.com/drive/u/0/folders/14gLTEEm50sUHA25q2_EeV_9x9U9bVR8c', acceso: 'Equipo Datos GOPLYCO' },
    ],
  },
  {
    titulo: 'ANÁLISIS SALARIAL',
    items: [
      { nombre: 'ANÁLISIS SALARIOS', url: 'https://docs.google.com/spreadsheets/d/1bsR-ZjClikCfIfgAofQfHXSl4z8lRMB5PE9Ls_ZwXHI/edit?gid=2010526784#gid=2010526784', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'MODULOS Y GUARDIAS TÉCNICAS', url: 'https://docs.google.com/spreadsheets/d/1896mD7zYDENPFMKtQt0ToYbHugVxecw9Audlm_wqJ1A/edit?gid=477892275#gid=477892275', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'LIQUIDACIONES - VALORES/SALARIOS', url: 'https://docs.google.com/spreadsheets/d/1KMGeA4HAO9eno-28iIUM-ko-eq2qwfV9/edit?gid=1743501056#gid=1743501056', acceso: 'SGO CSL - Equipo Juan Manuel' },
      { nombre: 'URSES', url: 'https://docs.google.com/spreadsheets/d/15UAws5gxlG5Oz63FO15CCXU5joHCGLrKI4WOmmFYTfA/edit?gid=1646050886#gid=1646050886', acceso: 'SGO CSL - Equipo Juan Manuel' },
    ],
  },
  {
    titulo: 'REPORTES',
    items: [
      { nombre: 'ODONTOLOGÍA', url: 'https://docs.google.com/spreadsheets/d/1sYUmFr9eKifEYJfAm4-A5OTqjw_GIGfnFbkbi6ZKUVM/edit?gid=0#gid=0', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'OFTALMOLOGÍA', url: 'https://docs.google.com/spreadsheets/d/1xB5QffbqQJnj_UWng-PDmyLXu1_GkIbeWyiWk3EaJfs/edit?gid=0#gid=0', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'FONOAUDIOLOGÍA', url: 'https://docs.google.com/spreadsheets/d/1IDxTVO7dEeno8S2nnNJxDG-z1sOAYnxC-dzSKaMbuQo/edit?gid=1536159480#gid=1536159480', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'ECOGRAFÍA', url: 'https://docs.google.com/spreadsheets/d/1LxlZS-femHt1_GzcUIWClZJVAAgBu0Uc11zl1AzZTkA/edit?gid=277009278#gid=277009278', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'GASTRO Y ANESTESIOLOGÍA', url: 'https://docs.google.com/spreadsheets/d/1aX83GhwTIc2HWoJMyxUqmeQso4irb068l3YjwryIeZo/edit?gid=1961074239#gid=1961074239', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'KINESIOLOGÍA', url: 'https://docs.google.com/spreadsheets/d/1eR7CQZOtqg-sF4k9TxRodtoIURcFO071oZRLQDM_RsI/edit?gid=717794166#gid=717794166', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'SALUD MENTAL', url: 'https://docs.google.com/spreadsheets/d/12colytlE2CKlYvATDDGrVBLUX2rbkILbDnNcGEKaSA0/edit?gid=1059789713#gid=1059789713', acceso: 'SGORASV - Equipo Alexis' },
      { nombre: 'DESIGNADOS RRHH TURNOS', url: 'https://docs.google.com/spreadsheets/d/17jOr7ZP9njkNkS5uoejHitRe36X5gJiflRhm94saI0I/edit?gid=293030356#gid=293030356', acceso: 'SGORASV - Equipo Alexis' },
    ],
  },
]

// "SISTEMA" era un enlace suelto fuera de acordeón en el legacy (con estilo
// invertido). Acá no tiene mucho sentido (ya estamos DENTRO del sistema), así
// que se omite — el resto de ENLACES DIRECTOS se porta igual.
export const HUB_ENLACES: HubCategoria[] = [
  {
    titulo: 'PROYECTOS Y DESARROLLOS',
    items: [
      { nombre: 'GITLAB', url: 'https://repositorio-asi.buenosaires.gob.ar/users/sign_in', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'Plataforma Obras', url: 'https://obras-neon-five.vercel.app/', acceso: 'Equipo Datos GOPLYCO' },
    ],
  },
  {
    titulo: 'NEWSLETTER DGAYDRH',
    items: [
      { nombre: "ARCHIVO NEWSLETTER's", url: 'https://linktr.ee/GO.RRHH', acceso: 'SGOPYGD - Equipo Luciano' },
    ],
  },
  {
    titulo: 'PLATAFORMAS BA',
    items: [
      { nombre: 'SADE', url: 'https://cas.buenosaires.gob.ar/acceso/login/login.zul?service=http://eu.gcba.gob.ar/eu-web', acceso: 'Público' },
      { nombre: 'EQUIPO BA', url: 'https://equipoba.buenosaires.gob.ar/landing', acceso: 'Público' },
      { nombre: 'MI BA - TAD', url: 'https://login.buenosaires.gob.ar/', acceso: 'Público' },
      { nombre: 'BAX (IA)', url: 'https://buenosaires.gob.ar/gcaba_historico/bax', acceso: 'Público' },
      { nombre: 'BA DESDE ADENTRO', url: 'https://badesdeadentro.gob.ar/', acceso: 'Público' },
    ],
  },
]

export const HUB_PRESENTACIONES: HubCategoria[] = [
  {
    titulo: 'ENTREGABLES',
    items: [
      { nombre: 'TRIMESTRAL 2025', url: 'https://docs.google.com/presentation/d/1ub8qPazc-G7Tuwaq1F0IdZLjn1Zt25G6P5KnKrbZJk4/edit?usp=sharing', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'INFORME PRIMER CUATRIMESTRE 2026', url: 'https://docs.google.com/presentation/d/1ub8qPazc-G7Tuwaq1F0IdZLjn1Zt25G6P5KnKrbZJk4/edit?usp=sharing', acceso: 'Equipo Datos GOPLYCO' },
      { nombre: 'INFORME SEGUNDO CUATRIMESTRE 2026', url: 'https://docs.google.com/presentation/d/1XjNI0UIpHbpfEseTtwDec2XNvptepCoQxLkBrtBYDXY/edit?usp=sharing', acceso: 'Equipo Datos GOPLYCO' },
    ],
  },
  {
    titulo: 'PRESENTACIONES GENERALES',
    items: [
      { nombre: 'BALANCE 25|26 DGAYDRH', url: 'https://docs.google.com/presentation/d/1AX5FNrhrPF31S78m49k-bAjiCfptKjXyzDk_wtnUVN4/edit?usp=sharing', acceso: 'Equipo Datos GOPLYCO' },
    ],
  },
]
