// Lógica portada desde dotacion-rrhh/frontend/src/utils/concursalesHelpers.js

export const OPCIONES_ORIGEN = ['Alta por Baja', 'Cobertura Dotación'] as const
export type OrigenBaja = typeof OPCIONES_ORIGEN[number]

export const OPCIONES_MOTIVO_BAJA = [
  'Renuncia', 'Cese de Cargo', 'Defunción', 'Jubilación', 'Cesantía',
  'Jubilación Ordinaria', 'Exoneración', 'Reubicación', 'Cese', 'Retención de Cargo',
]

export const OPCIONES_CODIGO_REGISTRO = ['37', '23', '87', '85', '83']
export const OPCIONES_UNIFICADOR      = ['CPH de Guardia', 'CPH de Planta', 'Jefaturas']
export const OPCIONES_ESCALAFON_BAJAS = ['Médico', 'No Médico']
export const OPCIONES_POU_POF         = ['POU', 'POF']

export const CEETPS_CODIGOS = [87, 85, 83]

export const CEETPS_ESCALAFON: Record<number, string> = {
  87: 'Enfermería', 85: 'Técnicos', 83: 'Servicios',
}
export const CEETPS_UNIFICADOR: Record<number, string> = {
  87: 'Nueva Carrera de Enfermería', 85: 'CEETPS', 83: 'Escalafón General',
}

export function evaluarCph(generaConcurso: boolean, puestoBaja: string, codigoRegistro: number): boolean {
  if (CEETPS_CODIGOS.includes(codigoRegistro)) return false
  if (!generaConcurso) return false
  const p = puestoBaja.toUpperCase()
  return !p.includes('TÉCNICO') && !p.includes('TECNICO') &&
         !p.includes('ENFERMERÍA') && !p.includes('ENFERMERIA')
}

export function evaluarCeetps(generaConcurso: boolean, codigoRegistro: number): boolean {
  return CEETPS_CODIGOS.includes(codigoRegistro) && generaConcurso
}

const PUESTO_JEFATURAS        = ['JEFE DEPARTAMENTO', 'JEFE DIVISION', 'JEFE SECCION', 'JEFE UNIDAD']
const PUESTO_GUARDIA_MEDICO   = ['ESPECIALISTA EN LA GUARDIA MEDICO', 'PROFESIONAL GUARDIA MEDICO']
const PUESTO_GUARDIA_NO_MED   = ['FARMACEUTICO DE GUARDIA','KINESIOLOGO DE GUARDIA','OBSTETRICA DE GUARDIA','TRABAJADOR SOCIAL DE GUARDIA','ODONTOLOGO DE GUARDIA','PSICOLOGO DE GUARDIA','BIOQUIMICO DE GUARDIA']
const PUESTO_PLANTA_MEDICO    = ['MEDICO DE PLANTA']
const PUESTO_PLANTA_NO_MED    = ['EXPERTO EN FISICA RADIANTE DE PLANTA','PSICOPEDAGOGO DE PLANTA','ODONTOLOGO DE PLANTA','FARMACEUTICO DE PLANTA','FONOAUDIOLOGO DE PLANTA','OBSTETRICA DE PLANTA','PSICOLOGO DE PLANTA','TRABAJADOR SOCIAL DE PLANTA','NUTRICIONISTA DIETISTA DE PLANTA','BIOQUIMICO DE PLANTA','KINESIOLOGO DE PLANTA','TERAPEUTA OCUPACIONAL DE PLANTA','MUSICOTERAPEUTA DE PLANTA','SOCIOLOGO DE PLANTA','LIC. EN CIENCIAS EDUC. DE PLANTA','BIOLOGO DE PLANTA']

export function getPuestoOptions(unificador: string, escalafon: string): string[] {
  const u = unificador.toLowerCase()
  const isMedico   = /^m[eé]dico$/i.test(escalafon)
  const isNoMedico = /no\s+m[eé]dico/i.test(escalafon)
  const isGuardia  = u.includes('guardia') || u === 'pou'
  const isPlanta   = u.includes('planta')  || u === 'pof'
  if (u.includes('jefatura')) return PUESTO_JEFATURAS
  if (isGuardia) {
    if (isMedico)   return [...PUESTO_GUARDIA_MEDICO]
    if (isNoMedico) return [...PUESTO_GUARDIA_NO_MED]
    return [...PUESTO_GUARDIA_MEDICO, ...PUESTO_GUARDIA_NO_MED]
  }
  if (isPlanta) {
    if (isMedico)   return [...PUESTO_PLANTA_MEDICO]
    if (isNoMedico) return [...PUESTO_PLANTA_NO_MED]
    return [...PUESTO_PLANTA_MEDICO, ...PUESTO_PLANTA_NO_MED]
  }
  if (isMedico)   return [...PUESTO_GUARDIA_MEDICO, ...PUESTO_PLANTA_MEDICO]
  if (isNoMedico) return [...PUESTO_GUARDIA_NO_MED, ...PUESTO_PLANTA_NO_MED]
  return [...PUESTO_GUARDIA_MEDICO, ...PUESTO_GUARDIA_NO_MED, ...PUESTO_PLANTA_MEDICO, ...PUESTO_PLANTA_NO_MED]
}

const PUESTO_ESP_MAP: Record<string, string[]> = {
  'ESPECIALISTA EN LA GUARDIA MEDICO': ['DIAGNOSTICO POR IMAGENES','ENDOSCOPIA','ANESTESIOLOGIA','CLINICA MEDICA','PEDIATRIA','CIRUGIA GENERAL','UROLOGIA','CIRUGIA INFANTIL','TERAPIA INTENSIVA','NEONATOLOGIA','CARDIOLOGIA','ORTOPEDIA Y TRAUMATOLOGIA','TERAPIA INTENSIVA INFANTIL','TOCOGINECOLOGIA','NEUROCIRUGIA','PSIQUIATRIA','PSIQUIATRIA INFANTO JUVENIL','INFECTOLOGIA','OFTALMOLOGIA','TOXICOLOGIA','NEFROLOGIA INFANTIL','GASTROENTEROLOGIA','CIRUGIA PLASTICA Y REPARADORA','CARDIOLOGIA INFANTIL','NEUMONOLOGIA','HEMOTERAPIA','NEUROLOGIA','NEFROLOGIA','CIRUGIA CARDIOVASCULAR','ASISTENCIA RESPIRATORIA INTENSIVA','HEMODINAMIA','OBSTETRICIA','DIAGNOSTICO POR IMAGENES (TOMOGRAFIA)','CIRUGIA TORAXICA','EMERGENTOLOGIA'],
  'PROFESIONAL GUARDIA MEDICO': ['SIN ESPECIALIDAD'],
  'FARMACEUTICO DE GUARDIA': ['FARMACIA HOSPITALARIA'],
  'KINESIOLOGO DE GUARDIA': ['KINESIOLOGIA'],
  'OBSTETRICA DE GUARDIA': ['OBSTETRICA'],
  'TRABAJADOR SOCIAL DE GUARDIA': ['TRABAJO SOCIAL Y SERVICIO SOCIAL'],
  'ODONTOLOGO DE GUARDIA': ['ODONTOLOGIA GENERAL','ODONTOPEDIATRIA'],
  'PSICOLOGO DE GUARDIA': ['PSICOLOGIA CLINICA'],
  'BIOQUIMICO DE GUARDIA': ['BIOQUIMICA CLINICA SIN ESPECIALIDAD','BIOQUIMICA','BIOQUIMICA CLINICA (QUIMICA CLINICA)','SIN ESPECIALIDAD','BIOQUIMICA CLINICA (BACTERIOLOGIA)','BIOQUIMICA CLINICA (HEMATOLOGIA)'],
  'MEDICO DE PLANTA': ['CLINICA MEDICA','OBSTETRICIA','INFECTOLOGIA INFANTIL','DIAGNOSTICO POR IMAGENES','ONCOLOGIA','MEDICINA GENERAL Y/O FAMILIAR','PEDIATRIA','PSIQUIATRIA','TOCOGINECOLOGIA','GASTROENTEROLOGIA','ANESTESIOLOGIA','CARDIOLOGIA','OFTALMOLOGIA','NEONATOLOGIA','TERAPIA INTENSIVA','FISIATRIA (MEDICINA FISICA Y REHABILITACION)','OTORRINOLARINGOLOGIA','UROLOGIA','INFECTOLOGIA','NEUROLOGIA','DERMATOLOGIA','PSIQUIATRIA INFANTO JUVENIL','MEDICO NUTRICIONISTA','DERMATOLOGIA PEDIATRICA','ORTOPEDIA Y TRAUMATOLOGIA','HEMOTERAPIA','GINECOLOGIA','GENETICA MEDICA','REUMATOLOGIA','CIRUGIA GENERAL','ANATOMIA PATOLOGICA','FISIATRIA','GERIATRIA','AUDITORIA MEDICA','NUTRICION','NEUROLOGIA INFANTIL','NEUMONOLOGIA','MEDICINA NUCLEAR','NEUROCIRUGIA','CIRUGIA CARDIOVASCULAR','TERAPIA INTENSIVA INFANTIL','ALERGIA E INMUNOPATOLOGIA','DIAGNOSTICO POR IMAGENES (ECOGRAFIA)','DIAGNOSTICO POR IMAGENES (TOMOGRAFIA)','CIRUGIA PLASTICA Y REPARADORA','ENDOCRINOLOGIA','RADIOTERAPIA O TERAPIA RADIANTE','SIN ESPECIALIDAD','HEMATOLOGIA','ASISTENCIA RESPIRATORIA INTENSIVA','CIRUGIA TORAXICA','CIRUGIA INFANTIL','HEPATOLOGIA','CARDIOLOGIA INFANTIL','OFTALMOLOGIA PEDIATRICA','FLEBOLOGIA','NEFROLOGIA'],
  'ODONTOLOGO DE PLANTA': ['ODONTOLOGIA GENERAL','PERIODONCIA','ORTODONCIA Y ORTOPEDIA MAXILAR','ODONTOPEDIATRIA','ENDODONCIA','CIRUGIA Y TRAUMATOLOGIA BUCOMAXILOFACIAL'],
  'FARMACEUTICO DE PLANTA': ['FARMACIA HOSPITALARIA'],
  'FONOAUDIOLOGO DE PLANTA': ['FONOAUDIOLOGIA'],
  'OBSTETRICA DE PLANTA': ['OBSTETRICA'],
  'PSICOLOGO DE PLANTA': ['PSICOLOGIA CLINICA','PSICOLOGIA INFANTIL'],
  'TRABAJADOR SOCIAL DE PLANTA': ['TRABAJO SOCIAL Y SERVICIO SOCIAL'],
  'NUTRICIONISTA DIETISTA DE PLANTA': ['LIC. EN NUTRICION'],
  'BIOQUIMICO DE PLANTA': ['BIOQUIMICA CLINICA (BACTERIOLOGIA)','BIOQUIMICA CLINICA (MICROBIOLOGIA CLINICA)','BIOQUIMICA CLINICA (QUIMICA CLINICA)','BIOQUIMICA CLINICA SIN ESPECIALIDAD','BIOQUIMICA','BIOQUIMICA CLINICA (GENETICA)','BIOQUIMICA CLINICA (LACTANCIA)'],
  'KINESIOLOGO DE PLANTA': ['KINESIOLOGIA'],
  'TERAPEUTA OCUPACIONAL DE PLANTA': ['TERAPIA OCUPACIONAL'],
  'MUSICOTERAPEUTA DE PLANTA': ['MUSICOTERAPIA'],
  'SOCIOLOGO DE PLANTA': ['SOCIOLOGIA'],
  'LIC. EN CIENCIAS EDUC. DE PLANTA': ['CIENCIAS DE LA EDUCACION'],
  'BIOLOGO DE PLANTA': ['SIN ESPECIALIDAD'],
  'EXPERTO EN FISICA RADIANTE DE PLANTA': ['RADIOTERAPIA O TERAPIA RADIANTE'],
  'PSICOPEDAGOGO DE PLANTA': ['PSICOPEDAGOGIA'],
}

export function getEspecialidadOptions(puesto: string): string[] {
  const key = puesto.trim().toUpperCase()
  for (const [k, v] of Object.entries(PUESTO_ESP_MAP)) {
    if (key === k.toUpperCase()) return v
  }
  return []
}

const CEETPS_PUESTOS: Record<string, string[]> = {
  'Técnicos': ['Tec. en Laboratorio','Tec. en Citologia','Tec. en Esterilizacion','Tec. en Anestesiologia','Tec. en Instrumentacion quirurgica','Tec. en Radiologia','Tec. en Hemoterapia','Tec. en Practicas cardiologicas','Tec. en Laboratorio de patologia','Tec. en Mecanica dental','Tec. en Farmacia','Tec. en Neurofisiologia','Tec. en Hematologia','Tec. en Optica','Tec. en Dialisis','Tec. en Quimica','Tec. en Necropsia','Tec. en Medicina nuclear','Tec. en Perfusion','Tec. en Ortesis y Protesis','Tec. en Podologia','Tec. en Biotecnologia','Tec. en Densiometria','Tec. en Asistencia dental'],
  'Enfermería': ['Lic. en Enfermeria','Enfermero Profesional','Lic. en Enfermeria ATP','Enfermero/a ATP','Auxiliar de Enfermeria'],
  'Servicios': ['Asistente Administrativo','Asistente Contable','Auxiliar Administrativo','Camillero','Chofer de Ambulancia','Cocinero','Conductor de Vehículos','Morguero','Operario de Mantenimiento','Oxigenista','Plomero'],
}

export function getCeetpsPuestoOptions(escalafon: string): string[] {
  return CEETPS_PUESTOS[escalafon] ?? []
}

export function formatDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  let dia  = digits.slice(0, 2)
  let mes  = digits.slice(2, 4)
  const anio = digits.slice(4, 8)
  if (dia.length === 2)  dia  = String(Math.min(Math.max(parseInt(dia)  || 0, 1), 31)).padStart(2, '0')
  if (mes.length === 2)  mes  = String(Math.min(Math.max(parseInt(mes)  || 0, 1), 12)).padStart(2, '0')
  let out = dia
  if (mes)  out += '/' + mes
  if (anio) out += '/' + anio
  return out
}

export function dmyToIso(v: string): string | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export function isoToDmy(v: string | null | undefined): string {
  if (!v) return ''
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v
}
