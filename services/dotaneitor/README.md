# Dotaneitor — Microservicio Python (SRRHH v2)

> Microservicio de procesamiento del padrón semanal Excel.
> Adaptado de `dotacion-rrhh/app/python-service` para usar PostgreSQL.

---

## Stack

- **FastAPI** + **Uvicorn**
- **Puerto**: `5001`
- **Python**: 3.11+
- **BD**: PostgreSQL 16 (via psycopg2)

---

## Flujo de procesamiento

```
1. POST /session              → crear sesión de trabajo
2. POST /upload-cargos        → subir Cargos_Salud.xlsx
3. POST /normalizar           → normalizar columnas del Excel
4. POST /procesar             → procesar dotación (lee tablas ref de BD)
5. POST /cruzar               → cruzar especialidades
6. POST /diff                 → calcular diferencias vs estado actual
   ← devuelve { nuevos, modificados, eliminados }
   (Node guarda el diff en padron_diff y gestiona la aprobación)
```

**Regla:** el frontend nunca habla directamente con este servicio. Todo pasa por la API Node.

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/session` | Crear sesión de trabajo |
| POST | `/upload-cargos` | Subir archivo Cargos_Salud.xlsx |
| POST | `/normalizar` | Normalizar datos |
| POST | `/procesar` | Procesar dotación |
| POST | `/cruzar` | Cruzar especialidades |
| GET | `/preview` | Preview paginado del resultado |
| GET | `/descargar` | Descargar Excel procesado |
| GET | `/reporte-calidad` | Descargar reporte de calidad |
| POST | `/diff` | Calcular diferencias vs BD |
| POST | `/session/delete` | Eliminar sesión y archivos temporales |

---

## Variables de entorno

```env
DATABASE_URL=postgresql://srrhh_user:srrhh_pass@localhost:5432/srrhh_db
```

---

## Pendiente — Sprint 2

- [ ] Adaptar `main.py`: reemplazar `mysql.connector` por `psycopg2`
- [ ] Adaptar queries SQL: MySQL → PostgreSQL
- [ ] Adaptar `DotacionAutomationBD.cargar_archivos()`: leer tablas de referencia desde PostgreSQL
- [ ] Adaptar `ConsolidadorEspecialidadesBD.cargar()`: leer desde PostgreSQL
- [ ] Adaptar `/diff` y `/guardar-bd`: usar tablas del schema Prisma
- [ ] Mapear columnas resultado → campos de `padron_diff` y `padron_historico`
- [ ] Eliminar endpoint `/guardar-bd` (la aprobación la maneja Node)
- [ ] Documentar en `Doc/Dotaneitor_Analisis.md` (tarea de Agustin — S0-5/S0-10)

---

## Diferencias con la versión legacy (dotacion-rrhh)

| Aspecto | Legacy | SRRHH v2 |
|---|---|---|
| Base de datos | MySQL | PostgreSQL |
| Tablas de referencia | `dot_agrupador`, `dot_unificador_puestos` | `ref_agrupadores`, `ref_unificadores_puesto` |
| Tabla resultado | `dot_resultado` | `padron_diff` + `padron_historico` |
| Aprobación | `/guardar-bd` en Python | Endpoint Node `POST /api/v1/padron/snapshots/:id/aprobar` |
| Historial | `dot_resultado_historico` | `padron_historico` (particionado) |

---

## Desarrollo local

```bash
cd services/dotaneitor
pip install -r requirements.txt
uvicorn main:app --reload --port 5001
```

O con Docker:
```bash
docker compose up dotaneitor -d
```
