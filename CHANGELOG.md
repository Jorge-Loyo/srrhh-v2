# Changelog

Registro de cambios funcionales del sistema SRRHH v2, conforme al Anexo I del
Estándar de Desarrollo ASI ES0901 (repositorio de control de versiones).

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versionado semántico [SemVer](https://semver.org/lang/es/): `MAJOR.MINOR.PATCH`.

> Convención de tags (Anexo I ES0901): al cerrar una versión se genera un tag
> desde `master`/`main` con el sufijo correspondiente: `-BETA` (pruebas en QA),
> `-RC` (candidata a producción) o `-HOTFIX` (corrección urgente sobre productivo).
> Cada entrada referencia, cuando corresponde, el número de ticket/sprint y las
> funcionalidades incluidas.

## [No publicado]

### Agregado
- Endpoints de health check `/health/liveness` y `/health/readiness` en la API
  (Anexo IV ES0901). `liveness` confirma que el proceso responde; `readiness`
  valida la conexión a PostgreSQL y responde `503` si la base no está disponible.
- Módulo Reportes: sección colapsable "Evolución de dotación" que agrupa los
  gráficos de evolución de la dotación (histórica) y de evolución por carrera y
  especialidad (mudados desde el Tablero de KPIs).
- Concursos CPH: filtro "Etapa" en el listado, que filtra por las 5 etapas del
  stepper a partir del `sub_estado`.
- Concursos CPH: encabezado del wizard colapsable (inicia contraído) para dar
  más espacio vertical al formulario de cada etapa.

### Cambiado
- Tablero de KPIs: se quitó el filtro de hospitales (los KPIs se muestran
  globales). Los gráficos de evolución de dotación se movieron al módulo
  Reportes.
- Sub-estados de concursos CPH: normalizados a minúscula sin tildes en toda la
  lógica, alineados con la convención de datos del proyecto.
- Padrón: procesamiento asíncrono con jobs y polling, para evitar timeouts al
  procesar padrones grandes.

### Corregido
- Organigrama: el DEPT Técnico en régimen Técnicos se muestra correctamente como
  Profesionales (sus integrantes son CPH); canonización del régimen de empleo
  blindada en código.
- Tests de la API: se tiparon los helpers HTTP para eliminar 39 errores de
  typecheck preexistentes (TS2339) y se alineó `concursosCph.calc.test` con el
  tipo `ConcursoCphCalcInput`.

---

> Nota: este changelog se incorpora a partir de esta fecha. El historial
> detallado anterior de sprints está documentado en
> `Doc/Planificacion/PLAN_SCRUM_2026.md`.
