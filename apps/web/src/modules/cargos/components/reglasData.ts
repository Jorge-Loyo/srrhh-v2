import type { EscalafonFlow } from './reglasData.types'

export const CPH_FLOW: EscalafonFlow = {
  "id": "cph",
  "nombre": "CPH — Carrera Profesional Hospitalaria",
  "color": "blue",
  "descripcion": "Profesionales de la salud (médicos, odontólogos, psicólogos, bioquímicos, etc.).",
  "norma": "Ley 6.035",
  "tipos": [
    {
      "id": "cph-pof",
      "nombre": "Ejecución Planta (POF)",
      "codigo": "CPH-POF-{seq}",
      "ejemplo": "CPH-POF-000056",
      "modalidad": "Planta Orgánica Funcional — horario fijo, sin guardia",
      "puestos": [
        "MEDICO DE PLANTA",
        "ODONTOLOGO DE PLANTA",
        "FARMACEUTICO DE PLANTA",
        "FONOAUDIOLOGO DE PLANTA",
        "OBSTETRICA DE PLANTA",
        "PSICOLOGO DE PLANTA",
        "TRABAJADOR SOCIAL DE PLANTA",
        "NUTRICIONISTA DIETISTA DE PLANTA",
        "BIOQUIMICO DE PLANTA",
        "KINESIOLOGO DE PLANTA",
        "TERAPEUTA OCUPACIONAL DE PLANTA",
        "MUSICOTERAPEUTA DE PLANTA",
        "SOCIOLOGO DE PLANTA",
        "LIC. EN CIENCIAS EDUC. DE PLANTA",
        "BIOLOGO DE PLANTA",
        "EXPERTO EN FISICA RADIANTE DE PLANTA",
        "PSICOPEDAGOGO DE PLANTA"
      ],
      "reglas": [
        "POF = Planta Orgánica Funcional: horario fijo, no rotativo",
        "Cada puesto tiene especialidades válidas fijas (MEDICO DE PLANTA: 50+ especialidades)",
        "Genera concurso CPH al quedar vacante (origen: Alta por Baja)",
        "Código generado por el sistema: CPH-POF-{6 dígitos}",
        "id_sial_rol en la ocupación = legajo SIAL de la persona + nro de rol",
        "El cargo estructural persiste aunque cambien las personas que lo ocupan",
        "situacion_revista: Activo / Retencion de Cargo / Comision",
        "Campos de ocupación: cargo_desde, documentacion_del_rol, documentacion_baja"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA POF",
          "subtitle": "Expediente / Resolución",
          "color": "blue",
          "icon": "",
          "items": [
            "Tipo alta: ejecucion + modalidad planta",
            "Hospital + Escalafón CPH asignados",
            "Repartición (codigo_repa + descripcion_repa)",
            "Puesto: MEDICO DE PLANTA, PSICOLOGO DE PLANTA, etc.",
            "Especialidad según puesto seleccionado",
            "Código generado: CPH-POF-XXXXXX",
            "Estado inicial: vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO CPH",
          "subtitle": "Proceso de selección",
          "color": "yellow",
          "icon": "",
          "items": [
            "EE Baja (expediente de baja)",
            "EE Concurso (expediente de concurso)",
            "Fecha autorización + sorteo de jurado",
            "Disposición de llamado a concurso",
            "Período de inscripción (desde / hasta)",
            "Fecha de examen + orden de mérito",
            "IFACS (aptitud médica) + INSAL",
            "EE Designación → Resolución de designación",
            "Sub-estados: A-VALID.VCTE → B-AUTORIZADO → C-INSCRIPCION → D-ETAPA EVAL → E-ADJUDI → F-PROX.A DESIG → G-RESOLUCION"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN",
          "subtitle": "Persona ocupa el cargo",
          "color": "green",
          "icon": "",
          "items": [
            "Ocupación: persona_id + cargo_id + id_sial_rol",
            "id_sial_rol = {legajo SIAL}-{nro de rol}",
            "situacion_revista = Activo",
            "cargo_desde = fecha de inicio",
            "documentacion_del_rol = resolución",
            "Estado: vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "RETENCIÓN DE CARGO",
          "subtitle": "Ejerce funciones en otro cargo",
          "color": "purple",
          "icon": "",
          "items": [
            "situacion_revista = Retencion de Cargo",
            "Cargo POF sigue vigente + ocupado (retenido)",
            "La persona ejerce activamente en otro cargo",
            "sr_doc_respaldo = documento que avala la retención",
            "sr_comentario = observaciones",
            "No genera vacante ni concurso en el cargo retenido"
          ]
        },
        {
          "id": "n5",
          "title": "COMISIÓN",
          "subtitle": "Comisión de servicios",
          "color": "orange",
          "icon": "",
          "items": [
            "situacion_revista = Comision",
            "comision = descripción de la comisión",
            "repa_comision = repartición de destino",
            "cr_comentario = comentarios",
            "Cargo sigue vigente + ocupado",
            "No genera vacante"
          ]
        },
        {
          "id": "n6",
          "title": "BAJA / VACANTE",
          "subtitle": "El cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Motivos: Jubilación, Renuncia, Defunción, Cesantía, Cese, Exoneración",
            "Ocupacion.hasta = fecha de baja",
            "documentacion_baja = expediente de baja",
            "Si persona sin otras ocupaciones → activo = false",
            "Estado: vigente + vacante",
            "genera_concurso = true → inicia proceso CPH"
          ]
        },
        {
          "id": "n7",
          "title": "NO VIGENTE",
          "subtitle": "Fuera de estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Desaparece del padrón semanal",
            "Padrón diff tipo: eliminado",
            "estado = no_vigente",
            "Historial de ocupaciones preservado",
            "No genera nuevos concursos"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "cargo vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "concurso finalizado"
        },
        {
          "from": "n2",
          "to": "n2",
          "label": "desierto → rellamado",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "asume otro cargo",
          "dashed": true
        },
        {
          "from": "n4",
          "to": "n3",
          "label": "regresa al cargo",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n5",
          "label": "comisión",
          "dashed": true
        },
        {
          "from": "n5",
          "to": "n3",
          "label": "regresa",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n6",
          "label": "jubilación / renuncia / cese"
        },
        {
          "from": "n6",
          "to": "n2",
          "label": "genera concurso"
        },
        {
          "from": "n6",
          "to": "n7",
          "label": "supresión del cargo"
        }
      ]
    },
    {
      "id": "cph-pou",
      "nombre": "Ejecución Guardia (POU)",
      "codigo": "CPH-POU-{seq}",
      "ejemplo": "CPH-POU-000012",
      "modalidad": "Planta Orgánica de Urgencia — guardia rotativa",
      "puestos": [
        "ESPECIALISTA EN LA GUARDIA MEDICO",
        "PROFESIONAL GUARDIA MEDICO",
        "FARMACEUTICO DE GUARDIA",
        "KINESIOLOGO DE GUARDIA",
        "OBSTETRICA DE GUARDIA",
        "TRABAJADOR SOCIAL DE GUARDIA",
        "ODONTOLOGO DE GUARDIA",
        "PSICOLOGO DE GUARDIA",
        "BIOQUIMICO DE GUARDIA"
      ],
      "reglas": [
        "POU = Planta Orgánica de Urgencia: guardia rotativa",
        "ESPECIALISTA EN LA GUARDIA MEDICO: 35+ especialidades (ANESTESIOLOGIA, CLINICA MEDICA, PEDIATRIA, CIRUGIA GENERAL, TERAPIA INTENSIVA, etc.)",
        "PROFESIONAL GUARDIA MEDICO: especialidad siempre SIN ESPECIALIDAD",
        "Días de guardia en ocupacion.diasGuardia (array de strings)",
        "pou_desde = fecha inicio guardia, documentacion_pou = resolución",
        "Genera concurso CPH POU al quedar vacante (mismo proceso que POF)",
        "TEC POU aplica a: Radiólogos, Hemoterapia, Anatomía Patológica, Instrumentadores Quirúrgicos"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA POU",
          "subtitle": "Expediente / Resolución",
          "color": "blue",
          "icon": "",
          "items": [
            "Tipo alta: ejecucion + modalidad guardia",
            "Hospital + Escalafón CPH",
            "Puesto: ESPECIALISTA EN LA GUARDIA MEDICO, etc.",
            "Especialidad según puesto (35+ para Especialista)",
            "Días de guardia asignados (array)",
            "Código: CPH-POU-XXXXXX",
            "Estado: vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO CPH POU",
          "subtitle": "Proceso de selección",
          "color": "yellow",
          "icon": "",
          "items": [
            "Idéntico al proceso POF",
            "EE Baja → EE Concurso → Autorización",
            "Disposición → Inscripción → Examen",
            "Orden de mérito → IFACS → INSAL",
            "EE Designación → Resolución",
            "Sub-estados idénticos al POF"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN GUARDIA",
          "subtitle": "Persona ocupa la guardia",
          "color": "green",
          "icon": "",
          "items": [
            "Ocupación con diasGuardia[] poblado",
            "id_sial_rol = {legajo}-{nroRol}",
            "pou_desde = fecha inicio guardia",
            "documentacion_pou = resolución",
            "situacion_revista = Activo",
            "Estado: vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "BAJA / VACANTE",
          "subtitle": "Guardia queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Mismos motivos que POF",
            "Ocupacion.hasta = fecha de baja",
            "Estado: vigente + vacante",
            "Genera concurso CPH POU"
          ]
        },
        {
          "id": "n5",
          "title": "NO VIGENTE",
          "subtitle": "Fuera de estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Desaparece del padrón",
            "estado = no_vigente",
            "Historial preservado"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "cargo vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "concurso finalizado"
        },
        {
          "from": "n2",
          "to": "n2",
          "label": "desierto → rellamado",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "jubilación / renuncia / cese"
        },
        {
          "from": "n4",
          "to": "n2",
          "label": "genera concurso"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "cph-jefe",
      "nombre": "Jefaturas (J-POF / J-POU)",
      "codigo": "CPH-J-POF-{seq} / CPH-J-POU-{seq}",
      "ejemplo": "CPH-J-POF-000003",
      "modalidad": "Planta o Guardia según jefatura",
      "puestos": [
        "JEFE DEPARTAMENTO",
        "JEFE DIVISION",
        "JEFE SECCION",
        "JEFE UNIDAD"
      ],
      "reglas": [
        "Jefe de Planta → CPH-J-POF, Jefe de Guardia → CPH-J-POU",
        "codigo_jefaturas y jefe_escalafon se registran en la ocupación",
        "documentacion_jefatura = resolución de designación como jefe",
        "comentarios_jefaturas = observaciones adicionales",
        "Retención frecuente: jefe que asume como director interino",
        "situacion_revista: Activo / Retencion de Cargo / Comision",
        "Genera concurso CPH jefatura al quedar vacante",
        "Puede retener simultáneamente su cargo de ejecución (POF o POU)"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA JEFATURA",
          "subtitle": "Por estructura",
          "color": "blue",
          "icon": "",
          "items": [
            "Tipo alta: estructura",
            "Modalidad: POF o POU según jefatura",
            "Puesto: JEFE DEPARTAMENTO / DIVISION / SECCION / UNIDAD",
            "codigo_jefaturas + jefe_escalafon",
            "Código: CPH-J-POF-XXXXXX o CPH-J-POU-XXXXXX",
            "Estado: vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO JEFATURA",
          "subtitle": "Proceso de selección",
          "color": "yellow",
          "icon": "",
          "items": [
            "Requiere ser profesional CPH activo en el hospital",
            "Mismo proceso que ejecución CPH",
            "EE Baja → EE Concurso → Autorización → Designación"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN JEFE",
          "subtitle": "Profesional asume jefatura",
          "color": "green",
          "icon": "",
          "items": [
            "situacion_revista = Activo",
            "codigo_jefaturas registrado en ocupación",
            "jefe_escalafon registrado",
            "documentacion_jefatura = resolución",
            "Puede retener su cargo de ejecución simultáneamente",
            "Estado: vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "RETENCIÓN DE CARGO",
          "subtitle": "Jefe ejerce otra función",
          "color": "purple",
          "icon": "",
          "items": [
            "situacion_revista = Retencion de Cargo",
            "Retiene jefatura mientras ejerce dirección o AS",
            "Cargo de jefatura: vigente + ocupado (retenido)",
            "sr_doc_respaldo = documento que avala",
            "No genera vacante en la jefatura"
          ]
        },
        {
          "id": "n5",
          "title": "COMISIÓN",
          "subtitle": "Jefe en comisión",
          "color": "orange",
          "icon": "",
          "items": [
            "situacion_revista = Comision",
            "comision + repa_comision registrados",
            "Cargo sigue vigente + ocupado",
            "No genera vacante"
          ]
        },
        {
          "id": "n6",
          "title": "BAJA JEFATURA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Renuncia a jefatura, jubilación, cese",
            "Ocupacion.hasta = fecha",
            "Estado: vigente + vacante",
            "Genera concurso CPH jefatura"
          ]
        },
        {
          "id": "n7",
          "title": "NO VIGENTE",
          "subtitle": "Jefatura suprimida",
          "color": "gray",
          "icon": "",
          "items": [
            "Reorganización estructural",
            "estado = no_vigente",
            "Historial preservado"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "cargo vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "concurso finalizado"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "asume dirección / AS",
          "dashed": true
        },
        {
          "from": "n4",
          "to": "n3",
          "label": "regresa a jefatura",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n5",
          "label": "comisión",
          "dashed": true
        },
        {
          "from": "n5",
          "to": "n3",
          "label": "regresa",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n6",
          "label": "cese / jubilación"
        },
        {
          "from": "n6",
          "to": "n2",
          "label": "genera concurso"
        },
        {
          "from": "n6",
          "to": "n7",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "cph-director",
      "nombre": "Director / Sub Director",
      "codigo": "CPH-D-{seq} / CPH-SD-{seq}",
      "ejemplo": "CPH-D-000002",
      "modalidad": "Sin modalidad en el código",
      "puestos": [
        "DIRECTOR",
        "SUB DIRECTOR"
      ],
      "reglas": [
        "Director y Sub Director NO tienen modalidad (ni POF ni POU) en el código",
        "Sub Director aplica solo a CPH, solo por estructura",
        "Designación directa por resolución ministerial — sin concurso",
        "situacion_revista aplica igual que jefaturas",
        "Retención frecuente: director que asume ministerio o subsecretaría",
        "Al quedar vacante puede generar nueva designación directa o concurso"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA DIRECCIÓN",
          "subtitle": "Por estructura / decreto",
          "color": "blue",
          "icon": "",
          "items": [
            "Tipo alta: estructura",
            "Sin modalidad en el código",
            "Hospital + Escalafón CPH",
            "Puesto: DIRECTOR o SUB DIRECTOR",
            "Código: CPH-D-XXXXXX / CPH-SD-XXXXXX",
            "Estado: vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN DIRECTA",
          "subtitle": "Resolución ministerial",
          "color": "green",
          "icon": "",
          "items": [
            "Sin concurso previo",
            "Resolución MSGC / MEFGC",
            "situacion_revista = Activo",
            "documentacion_del_rol = resolución",
            "Estado: vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "RETENCIÓN",
          "subtitle": "Director ejerce otra función",
          "color": "purple",
          "icon": "",
          "items": [
            "situacion_revista = Retencion de Cargo",
            "Retiene dirección mientras ejerce AS o RG",
            "No genera vacante en la dirección"
          ]
        },
        {
          "id": "n4",
          "title": "BAJA DIRECCIÓN",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Renuncia, jubilación, fin de mandato",
            "Ocupacion.hasta = fecha",
            "Estado: vigente + vacante",
            "Nueva designación directa o concurso"
          ]
        },
        {
          "id": "n5",
          "title": "NO VIGENTE",
          "subtitle": "Dirección suprimida",
          "color": "gray",
          "icon": "",
          "items": [
            "Reorganización / fusión de hospitales",
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "resolución directa"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "asume AS / RG",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "regresa",
          "dashed": true
        },
        {
          "from": "n2",
          "to": "n4",
          "label": "cese / jubilación"
        },
        {
          "from": "n4",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "supresión"
        }
      ]
    }
  ]
}

export const ENF_FLOW: EscalafonFlow = {
  "id": "enf",
  "nombre": "ENF — Enfermería",
  "color": "green",
  "descripcion": "Enfermeros/as y licenciados en enfermería. Única carrera con jornada.",
  "norma": "Ley 6.767",
  "tipos": [
    {
      "id": "enf-ej",
      "nombre": "Ejecución Enfermería",
      "codigo": "ENF-{seq}",
      "ejemplo": "ENF-000234",
      "modalidad": "Sin modalidad — jornada completa o ATP",
      "puestos": [
        "Lic. en Enfermeria",
        "Enfermero Profesional",
        "Lic. en Enfermeria ATP",
        "Enfermero/a ATP",
        "Auxiliar de Enfermeria"
      ],
      "reglas": [
        "Sin modalidad POF/POU en el código: ENF-{seq}",
        "Jornada: completa o ATP (Actividad de Tiempo Parcial) — única carrera con jornada",
        "id_jornada en la ocupación (NULL en todas las demás carreras)",
        "Sin especialidad: id_especialidad = NULL por diseño",
        "Genera concurso CEETPS (cod. registro 87) al vacar",
        "Unificador de puesto: Nueva Carrera de Enfermería",
        "Escalafón CEETPS código 87"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA ENF",
          "subtitle": "Expediente / Resolución",
          "color": "green",
          "icon": "",
          "items": [
            "Tipo: ejecucion",
            "Sin modalidad",
            "Hospital + Escalafón ENF",
            "Puesto: Lic. en Enfermeria, Enfermero Profesional, Auxiliar, etc.",
            "Jornada: completa o ATP",
            "Sin especialidad (NULL)",
            "Código: ENF-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO CEETPS",
          "subtitle": "Proceso CEETPS cod.87",
          "color": "yellow",
          "icon": "",
          "items": [
            "Escalafón 87 = Enfermería",
            "Expediente de concurso",
            "Puesto solicitado",
            "Disposición de llamado",
            "IFACS + INSAL",
            "Expediente designación",
            "Disposición designación",
            "Resolución designación"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN",
          "subtitle": "Enfermero/a ocupa el cargo",
          "color": "green",
          "icon": "",
          "items": [
            "Ocupación: persona_id + cargo_id",
            "id_sial_rol = legajo-nroRol",
            "id_jornada = jornada asignada",
            "situacion_revista = Activo",
            "cargo_desde = fecha inicio",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "BAJA / VACANTE",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Jubilación / Renuncia / Cese",
            "Ocupacion.hasta = fecha",
            "vigente + vacante",
            "Genera concurso CEETPS 87"
          ]
        },
        {
          "id": "n5",
          "title": "NO VIGENTE",
          "subtitle": "Fuera de estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Desaparece del padrón",
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "finalizado"
        },
        {
          "from": "n2",
          "to": "n2",
          "label": "desierto → rellamado",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "jubilación / renuncia"
        },
        {
          "from": "n4",
          "to": "n2",
          "label": "genera concurso CEETPS"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "supresión"
        }
      ]
    }
  ]
}

export const TEC_FLOW: EscalafonFlow = {
  "id": "tec",
  "nombre": "TEC — Técnicos (CEETPS)",
  "color": "orange",
  "descripcion": "Técnicos de la salud. Escalafón CEETPS cod.85.",
  "norma": "Ley 6.035 / CEETPS",
  "tipos": [
    {
      "id": "tec-pof",
      "nombre": "Técnico Planta (POF)",
      "codigo": "TEC-POF-{seq}",
      "ejemplo": "TEC-POF-000089",
      "modalidad": "Planta — horario fijo",
      "puestos": [
        "Tec. en Laboratorio",
        "Tec. en Citologia",
        "Tec. en Esterilizacion",
        "Tec. en Anestesiologia",
        "Tec. en Farmacia",
        "Tec. en Neurofisiologia",
        "Tec. en Hematologia",
        "Tec. en Optica",
        "Tec. en Dialisis",
        "Tec. en Quimica",
        "Tec. en Necropsia",
        "Tec. en Medicina nuclear",
        "Tec. en Perfusion",
        "Tec. en Ortesis y Protesis",
        "Tec. en Podologia",
        "Tec. en Biotecnologia",
        "Tec. en Densiometria",
        "Tec. en Asistencia dental"
      ],
      "reglas": [
        "TEC POF = planta, horario fijo",
        "Código: TEC-POF-{seq}",
        "Genera concurso CEETPS (cod.85) al vacar",
        "Unificador: CEETPS",
        "Sin especialidad (NULL), sin jornada (NULL)"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA TEC POF",
          "subtitle": "Expediente / Resolución",
          "color": "orange",
          "icon": "",
          "items": [
            "Tipo: ejecucion + planta",
            "Hospital + Escalafón TEC",
            "Puesto: Tec. en Laboratorio, Farmacia, etc.",
            "Sin especialidad (NULL)",
            "Código: TEC-POF-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO CEETPS",
          "subtitle": "Proceso CEETPS cod.85",
          "color": "yellow",
          "icon": "",
          "items": [
            "Escalafón 85 = Técnicos",
            "Expediente concurso",
            "Puesto solicitado",
            "Disposición llamado",
            "IFACS + INSAL",
            "Disposición designación",
            "Resolución designación"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN",
          "subtitle": "Técnico ocupa el cargo",
          "color": "green",
          "icon": "",
          "items": [
            "Ocupación: persona_id + cargo_id",
            "id_sial_rol = legajo-nroRol",
            "situacion_revista = Activo",
            "cargo_desde = fecha inicio",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "BAJA / VACANTE",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Jubilación / Renuncia / Cese",
            "Ocupacion.hasta = fecha",
            "vigente + vacante",
            "Genera concurso CEETPS 85"
          ]
        },
        {
          "id": "n5",
          "title": "NO VIGENTE",
          "subtitle": "Fuera de estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Desaparece del padrón",
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "finalizado"
        },
        {
          "from": "n2",
          "to": "n2",
          "label": "desierto → rellamado",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "jubilación / renuncia"
        },
        {
          "from": "n4",
          "to": "n2",
          "label": "genera concurso CEETPS"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "tec-pou",
      "nombre": "Técnico Guardia (POU)",
      "codigo": "TEC-POU-{seq}",
      "ejemplo": "TEC-POU-000011",
      "modalidad": "Guardia rotativa",
      "puestos": [
        "Tec. en Radiologia",
        "Tec. en Hemoterapia",
        "Tec. en Laboratorio de patologia",
        "Tec. en Instrumentacion quirurgica"
      ],
      "reglas": [
        "TEC POU aplica SOLO a: Radiólogos, Hemoterapia, Anatomía Patológica, Instrumentadores Quirúrgicos",
        "Código: TEC-POU-{seq}",
        "Genera concurso CEETPS (cod.85) al vacar",
        "Mismo proceso concursal que TEC POF",
        "diasGuardia[] en la ocupación"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA TEC POU",
          "subtitle": "Expediente / Resolución",
          "color": "orange",
          "icon": "",
          "items": [
            "Tipo: ejecucion + guardia",
            "Solo para puestos POU habilitados",
            "Radiología, Hemoterapia, Anatomía Patológica, Instrumentación",
            "Código: TEC-POU-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO CEETPS",
          "subtitle": "Proceso CEETPS cod.85",
          "color": "yellow",
          "icon": "",
          "items": [
            "Idéntico al TEC POF",
            "Escalafón 85 = Técnicos"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN",
          "subtitle": "Técnico ocupa guardia",
          "color": "green",
          "icon": "",
          "items": [
            "Ocupación con diasGuardia[]",
            "id_sial_rol = legajo-nroRol",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "BAJA / VACANTE",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Jubilación / Renuncia / Cese",
            "vigente + vacante",
            "Genera concurso CEETPS 85"
          ]
        },
        {
          "id": "n5",
          "title": "NO VIGENTE",
          "subtitle": "Fuera de estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "finalizado"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "jubilación / renuncia"
        },
        {
          "from": "n4",
          "to": "n2",
          "label": "genera concurso"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "supresión"
        }
      ]
    }
  ]
}

export const EG_FLOW: EscalafonFlow = {
  "id": "eg",
  "nombre": "EG — Escalafón General",
  "color": "gray",
  "descripcion": "Personal administrativo y de servicios generales.",
  "norma": "Ley 471",
  "tipos": [
    {
      "id": "eg-ej",
      "nombre": "Ejecución EG",
      "codigo": "EG-{seq}",
      "ejemplo": "EG-000401",
      "modalidad": "Sin modalidad",
      "puestos": [
        "Asistente Administrativo",
        "Asistente Contable",
        "Auxiliar Administrativo",
        "Camillero",
        "Chofer de Ambulancia",
        "Cocinero",
        "Conductor de Vehículos",
        "Morguero",
        "Operario de Mantenimiento",
        "Oxigenista",
        "Plomero"
      ],
      "reglas": [
        "Sin modalidad en el código: EG-{seq}",
        "Sin especialidad (NULL), sin jornada (NULL)",
        "Genera concurso CEETPS (cod.83 Servicios) al vacar",
        "Unificador: Escalafón General",
        "Escalafón CEETPS código 83"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA EG",
          "subtitle": "Expediente / Resolución",
          "color": "gray",
          "icon": "",
          "items": [
            "Tipo: ejecucion",
            "Sin modalidad",
            "Hospital + Escalafón EG",
            "Puesto: Administrativo, Camillero, Cocinero, etc.",
            "Sin especialidad (NULL)",
            "Código: EG-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "CONCURSO CEETPS",
          "subtitle": "Proceso CEETPS cod.83",
          "color": "yellow",
          "icon": "",
          "items": [
            "Escalafón 83 = Servicios",
            "Expediente concurso",
            "Puesto solicitado",
            "Disposición llamado",
            "IFACS + INSAL",
            "Resolución designación"
          ]
        },
        {
          "id": "n3",
          "title": "DESIGNACIÓN",
          "subtitle": "Agente ocupa el cargo",
          "color": "green",
          "icon": "",
          "items": [
            "Ocupación: persona_id + cargo_id",
            "id_sial_rol = legajo-nroRol",
            "situacion_revista = Activo",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n4",
          "title": "BAJA / VACANTE",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Jubilación / Renuncia / Cese",
            "vigente + vacante",
            "Genera concurso CEETPS 83"
          ]
        },
        {
          "id": "n5",
          "title": "NO VIGENTE",
          "subtitle": "Fuera de estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "vacante"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "finalizado"
        },
        {
          "from": "n2",
          "to": "n2",
          "label": "desierto → rellamado",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "jubilación / renuncia"
        },
        {
          "from": "n4",
          "to": "n2",
          "label": "genera concurso CEETPS"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "eg-jefe",
      "nombre": "Jefe EG",
      "codigo": "EG-J-{seq}",
      "ejemplo": "EG-J-000015",
      "modalidad": "Sin modalidad",
      "puestos": [
        "JEFE EG"
      ],
      "reglas": [
        "Código: EG-J-{seq}",
        "Tipo cargo: jefe_eg, es_estructura=1",
        "Sin modalidad, sin especialidad"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA JEFE EG",
          "subtitle": "Por estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: jefe_eg",
            "Código: EG-J-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN",
          "subtitle": "Agente asume jefatura",
          "color": "green",
          "icon": "",
          "items": [
            "Resolución de designación",
            "situacion_revista = Activo",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "BAJA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Cese / jubilación",
            "vigente + vacante"
          ]
        },
        {
          "id": "n4",
          "title": "NO VIGENTE",
          "subtitle": "Suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "designación"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "cese"
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "eg-director",
      "nombre": "Director EG",
      "codigo": "EG-D-{seq}",
      "ejemplo": "EG-D-000004",
      "modalidad": "Sin modalidad",
      "puestos": [
        "DIRECTOR EG"
      ],
      "reglas": [
        "Código: EG-D-{seq}",
        "Tipo cargo: director_eg, es_estructura=1",
        "Designación directa por resolución"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA DIRECTOR EG",
          "subtitle": "Por estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: director_eg",
            "Código: EG-D-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN DIRECTA",
          "subtitle": "Resolución",
          "color": "green",
          "icon": "",
          "items": [
            "Sin concurso",
            "Resolución ministerial",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "BAJA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Cese / jubilación",
            "vigente + vacante"
          ]
        },
        {
          "id": "n4",
          "title": "NO VIGENTE",
          "subtitle": "Suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "resolución"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "cese"
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "eg-gerencial",
      "nombre": "Gerencial EG",
      "codigo": "EG-G-{seq}",
      "ejemplo": "EG-G-000002",
      "modalidad": "Sin modalidad",
      "puestos": [
        "GERENTE",
        "SUBGERENTE"
      ],
      "reglas": [
        "Código: EG-G-{seq}",
        "Tipo cargo: gerencial, es_estructura=1",
        "Designación directa por resolución",
        "Mismo concepto que RG pero dentro del EG"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA GERENCIAL EG",
          "subtitle": "Por estructura",
          "color": "gray",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: gerencial",
            "Código: EG-G-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN DIRECTA",
          "subtitle": "Resolución",
          "color": "green",
          "icon": "",
          "items": [
            "Sin concurso",
            "Resolución ministerial",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "BAJA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Cese / jubilación / fin mandato",
            "vigente + vacante"
          ]
        },
        {
          "id": "n4",
          "title": "NO VIGENTE",
          "subtitle": "Suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "resolución"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "cese"
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "supresión"
        }
      ]
    }
  ]
}

export const RG_FLOW: EscalafonFlow = {
  "id": "rg",
  "nombre": "RG — Régimen Gerencial",
  "color": "purple",
  "descripcion": "Cargos gerenciales con mandato fijo (5 años). Carrera Gerencial.",
  "norma": "Carrera Gerencial",
  "tipos": [
    {
      "id": "rg-cg",
      "nombre": "Régimen Gerencial",
      "codigo": "RG-CG-{seq}",
      "ejemplo": "RG-CG-000047",
      "modalidad": "Sin modalidad — mandato fijo 5 años",
      "puestos": [
        "Gerente Operativo",
        "Subgerente Operativo",
        "Gerente de Gestión",
        "Subgerente de Gestión"
      ],
      "reglas": [
        "Código: RG-CG-{seq}",
        "Mandato fijo: 5 años (ej: 01/05/2026 – 30/04/2031)",
        "Designación directa por resolución MSGC — sin concurso",
        "cargo_desde y cargo_hasta en la ocupación",
        "Al vencer el mandato: ocupacion.hasta = fecha fin, cargo vuelve a vacante",
        "REGLA CLAVE: el cargo estructural es UNO SOLO aunque cambien las personas",
        "Cada persona genera su propio id_sial_rol (legajo-nroRol)",
        "Ejemplo: RG-CG-000047 fue de Cattaneo (001015311-2) y luego de Barreiro Machado (001448563-3)",
        "El sistema NO debe crear RG-CG-000194 si ya existe RG-CG-000047 para el mismo puesto/repartición",
        "Identificador del cargo estructural: hospital + escalafón + codigo_repa + literal_puesto"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA RG",
          "subtitle": "Por estructura / decreto",
          "color": "purple",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: rg",
            "Hospital + Escalafón RG",
            "Repartición (codigo_repa)",
            "Puesto: Gerente/Subgerente Operativo o Gestión",
            "Código: RG-CG-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN DIRECTA",
          "subtitle": "Resolución MSGC con mandato",
          "color": "green",
          "icon": "",
          "items": [
            "Sin concurso previo",
            "Resolución MSGC (ej: RESOL/1972/MSGC/2026)",
            "cargo_desde = fecha inicio mandato",
            "cargo_hasta = fecha fin mandato (5 años)",
            "id_sial_rol = legajo persona - nro rol",
            "documentacion_del_rol = resolución",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "RETENCIÓN",
          "subtitle": "Gerente ejerce otra función",
          "color": "purple",
          "icon": "",
          "items": [
            "situacion_revista = Retencion de Cargo",
            "Retiene RG mientras ejerce AS",
            "No genera vacante en el RG"
          ]
        },
        {
          "id": "n4",
          "title": "FIN DE MANDATO / BAJA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Vencimiento del mandato (cargo_hasta)",
            "Renuncia anticipada o cese",
            "Ocupacion.hasta = fecha",
            "vigente + vacante",
            "Nueva designación directa para el MISMO cargo RG-CG-XXXXXX"
          ]
        },
        {
          "id": "n5",
          "title": "NUEVA DESIGNACIÓN",
          "subtitle": "Otra persona, mismo cargo",
          "color": "green",
          "icon": "",
          "items": [
            "MISMO cargo_id (RG-CG-000047)",
            "NUEVO id_sial_rol (legajo nueva persona)",
            "NUEVA ocupación con nuevo mandato",
            "El historial del cargo muestra ambas personas",
            "Regla: NO crear cargo nuevo RG-CG-000194"
          ]
        },
        {
          "id": "n6",
          "title": "NO VIGENTE",
          "subtitle": "Cargo suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "Reorganización estructural",
            "estado = no_vigente",
            "Historial de todas las personas preservado"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "resolución directa"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "asume AS",
          "dashed": true
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "regresa",
          "dashed": true
        },
        {
          "from": "n2",
          "to": "n4",
          "label": "fin mandato / renuncia"
        },
        {
          "from": "n4",
          "to": "n5",
          "label": "nueva designación mismo cargo"
        },
        {
          "from": "n5",
          "to": "n4",
          "label": "fin mandato siguiente"
        },
        {
          "from": "n4",
          "to": "n6",
          "label": "supresión del cargo"
        }
      ]
    }
  ]
}

export const AS_FLOW: EscalafonFlow = {
  "id": "as",
  "nombre": "AS — Autoridades Superiores",
  "color": "red",
  "descripcion": "Ministros, subsecretarios, directores generales. Solo por estructura.",
  "norma": "No aplica",
  "tipos": [
    {
      "id": "as-min",
      "nombre": "Ministro",
      "codigo": "AS-MIN-{seq}",
      "ejemplo": "AS-MIN-000001",
      "modalidad": "Sin modalidad",
      "puestos": [
        "MINISTRO"
      ],
      "reglas": [
        "Código: AS-MIN-{seq}",
        "Solo por estructura (solo_estructura=1)",
        "Designación directa por decreto del Poder Ejecutivo",
        "Sin concurso, sin modalidad, sin especialidad"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA MINISTRO",
          "subtitle": "Decreto PEN",
          "color": "red",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: ministro",
            "Código: AS-MIN-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN",
          "subtitle": "Decreto PEN",
          "color": "green",
          "icon": "",
          "items": [
            "Decreto del Poder Ejecutivo",
            "Sin concurso",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "BAJA",
          "subtitle": "Renuncia / cambio gobierno",
          "color": "red",
          "icon": "",
          "items": [
            "Renuncia o cambio de gobierno",
            "vigente + vacante"
          ]
        },
        {
          "id": "n4",
          "title": "NO VIGENTE",
          "subtitle": "Ministerio suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "Reorganización del Estado",
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "decreto"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "renuncia/cambio"
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "as-ss",
      "nombre": "Subsecretaría",
      "codigo": "AS-SS-{seq}",
      "ejemplo": "AS-SS-000003",
      "modalidad": "Sin modalidad",
      "puestos": [
        "SUBSECRETARIO/A"
      ],
      "reglas": [
        "Código: AS-SS-{seq}",
        "Designación directa por resolución ministerial",
        "Solo por estructura"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA SUBSECRETARÍA",
          "subtitle": "Por estructura",
          "color": "red",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: subsecretaria",
            "Código: AS-SS-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN",
          "subtitle": "Resolución ministerial",
          "color": "green",
          "icon": "",
          "items": [
            "Resolución MSGC/MEFGC",
            "Sin concurso",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "BAJA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Renuncia / cese",
            "vigente + vacante"
          ]
        },
        {
          "id": "n4",
          "title": "NO VIGENTE",
          "subtitle": "Suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "resolución"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "cese"
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "supresión"
        }
      ]
    },
    {
      "id": "as-dg",
      "nombre": "Dirección General",
      "codigo": "AS-DG-{seq} / AS-DGA-{seq}",
      "ejemplo": "AS-DG-000005",
      "modalidad": "Sin modalidad",
      "puestos": [
        "DIRECTOR/A GENERAL",
        "DIRECTOR/A GENERAL ADJUNTO/A"
      ],
      "reglas": [
        "Código: AS-DG-{seq} para Dir. General, AS-DGA-{seq} para Adjunta",
        "Designación directa por resolución",
        "Solo por estructura"
      ],
      "nodes": [
        {
          "id": "n1",
          "title": "ALTA DIR. GENERAL",
          "subtitle": "Por estructura",
          "color": "red",
          "icon": "",
          "items": [
            "Tipo: estructura",
            "Tipo cargo: dir_general o dir_general_adjunta",
            "Código: AS-DG-XXXXXX / AS-DGA-XXXXXX",
            "vigente + vacante"
          ]
        },
        {
          "id": "n2",
          "title": "DESIGNACIÓN",
          "subtitle": "Resolución ministerial",
          "color": "green",
          "icon": "",
          "items": [
            "Resolución MSGC/MEFGC",
            "Sin concurso",
            "vigente + ocupado"
          ]
        },
        {
          "id": "n3",
          "title": "BAJA",
          "subtitle": "Cargo queda libre",
          "color": "red",
          "icon": "",
          "items": [
            "Renuncia / cese",
            "vigente + vacante"
          ]
        },
        {
          "id": "n4",
          "title": "NO VIGENTE",
          "subtitle": "Suprimido",
          "color": "gray",
          "icon": "",
          "items": [
            "estado = no_vigente"
          ]
        }
      ],
      "edges": [
        {
          "from": "n1",
          "to": "n2",
          "label": "resolución"
        },
        {
          "from": "n2",
          "to": "n3",
          "label": "cese"
        },
        {
          "from": "n3",
          "to": "n2",
          "label": "nueva designación"
        },
        {
          "from": "n3",
          "to": "n4",
          "label": "supresión"
        }
      ]
    }
  ]
}

export const ALL_FLOWS: EscalafonFlow[] = [CPH_FLOW, ENF_FLOW, TEC_FLOW, EG_FLOW, RG_FLOW, AS_FLOW]