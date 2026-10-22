# Aceptación — Gráfico comparativo de evolución (escala por indicador + tooltip/etiquetas compactas)

Rama: `grafico-comparativo-escala`
Worktree: `c:\Desarrollo\SRH\SRRHH-Legacy\.worktrees\grafico-comparativo-escala`

## Qué cambió

- `apps/web/src/modules/reportes/components/EvolucionEspecialidadChart.tsx`
- `apps/web/src/modules/reportes/lib/situacion-revista.ts`

Resumen funcional:

1. La escala Y ya **no arranca siempre en 0**. `rangoAjustado()` ajusta la ventana al
   rango real de los datos visibles con un padding del 15 %, de modo que las variaciones
   mes a mes se ven (antes quedaban aplastadas contra el piso 0).
2. En modo multi-indicador (≥2 indicadores visibles) aparece un **toggle de escala**:
   - **Escala real**: todas las series comparten una misma escala ajustada al rango global.
   - **Comparar tendencias**: cada indicador se normaliza contra su propio min/max (solo
     visual; los valores que se muestran siguen siendo los reales).
   - El modo por defecto se elige solo: si los niveles promedio de las series difieren por
     un factor ≥ 1,5 arranca en "Comparar tendencias"; si no, en "Escala real".
3. **Tooltip compacto**: caja con ancho acotado (máx. 240 px), ubicada en el lado opuesto
   al cursor y dentro del área de datos, con labels largos truncados con "…" (el label
   completo queda en el `<title>` nativo al pasar el mouse).
4. **Etiquetas del último punto**: pila anti-solape (separación mínima por fila) que muestra
   el **valor real** (personas) de cada serie en su último mes. En modo "Comparar tendencias"
   se prefija el label corto del indicador porque dos líneas de magnitud dispar pueden quedar
   a la misma altura visual.

## Build

Comando (desde el worktree):

```
pnpm --filter @srrhh/web build
```

Resultado: **OK / verde**. `tsc` + `vite build` completan sin errores (solo el aviso esperado
de chunk >500 kB, preexistente y no relacionado con este cambio). Build terminado en ~15 s.

## QA VISUAL (OBLIGATORIO)

Esto es un gráfico que se evalúa con el ojo: la verificación visual es parte de la aceptación.
Entorno local, puerto **:5180** (web). Arrancar back + front según `Doc/Desarrollo/ARRANQUE_LOCAL.md`
y abrir el navegador en `http://localhost:5180`.

### Preparación (común a todos los pasos)

1. Loguearse y entrar a **Reportes → Evolución de dotación** (sección "Evolución de dotación").
2. Armar **indicador 1 (magnitud grande)**: en el combo **Carrera** elegir el código **37**
   (CPH). Tocar **`+ Unión`**. Debe aparecer un chip de indicador con color propio y la cascada
   de filtros de arriba debe quedar vacía. El gráfico se recalcula solo (no hace falta "Aplicar").
3. Armar **indicador 2 (magnitud chica)**: en el combo **Carrera** elegir el código **87**
   (Enfermería). Tocar **`+ Unión`**. Debe aparecer un segundo chip de otro color.

   > Importante: 37 y 87 tienen dotaciones de **órdenes de magnitud distintos** a propósito;
   > esa disparidad es lo que ejercita la escala por indicador.

---

### (a) "Comparar tendencias": cada línea muestra su forma, NO se ve plana

Qué hacer:
- Con los 2 indicadores visibles, tocar el toggle **"Comparar tendencias"** (puede ya estar
  seleccionado por defecto, porque la relación de magnitudes 37 vs 87 supera el factor 1,5).

Qué mirar:
- Las **dos líneas** deben tener **relieve propio**: subidas y bajadas visibles a lo largo
  de los meses. Ninguna debe quedar pegada al borde inferior como una recta chata.
- La línea del indicador chico (87) en particular debe mostrar su variación, no una línea
  plana aplastada por el indicador grande (37).

Resultado esperado:
- **Ambas** curvas ocupan buena parte de la altura del gráfico y se les ve la forma/variación.
- Aparece el microcopy "Escala por indicador — comparando tendencias, no valores absolutos".
- El eje Y no muestra números (en tendencia cada serie tiene su propia escala; se ve una grilla
  neutra de 3 líneas).

### (b) El toggle cambia entre escala real compartida y normalizado por indicador

Qué hacer:
- Alternar entre **"Escala real"** y **"Comparar tendencias"** con los dos botones del toggle.

Qué mirar y esperar:
- **Escala real**: ambas líneas comparten una sola escala. El eje Y muestra **números
  rotulados** (piso, medio, techo). Con 37 vs 87 es esperable que la línea chica (87) quede
  relativamente abajo frente a la grande (37) — eso es correcto, es la comparación en valores
  absolutos.
- **Comparar tendencias**: cada línea se normaliza a su propio rango y se separan en altura;
  el eje Y pierde los números (grilla neutra). El botón activo queda resaltado (fondo color
  secundario, texto blanco) y el inactivo en gris.
- El cambio es inmediato al tocar cada botón; los **valores** mostrados (etiquetas/tooltip)
  no cambian entre modos, solo cambia la **posición vertical** de las líneas.

### (c) Tooltip compacto, no tapa las líneas, labels largos no desbordan

Qué hacer:
- Pasar el mouse sobre distintos meses del gráfico (sobre el área de datos).

Qué mirar y esperar:
- Aparece una **línea guía punteada** vertical en el mes y una **caja** con: el mes arriba y,
  por cada serie visible, su cuadrito de color, su label corto y su valor (ordenadas de mayor
  a menor valor).
- La caja se dibuja del **lado opuesto al cursor** y **dentro** del área del gráfico; no debe
  salirse por los bordes ni quedar encima tapando las líneas que se están mirando.
- La caja tiene **ancho acotado** (no crece sin control): con labels largos, el texto del label
  se **trunca con "…"**; al pasar el mouse sobre esa fila, el `title` nativo muestra el label
  completo.
- Para comprobar el truncado con labels largos: armar un indicador combinando Carrera + Puesto
  + Especialidad (un label más largo) y verificar que en el tooltip el nombre se corta con "…"
  y la caja mantiene su ancho máximo (no desborda).

### (d) Etiquetas de valor del último punto: no se enciman y muestran el valor REAL (personas)

Qué hacer:
- Mirar el **extremo derecho** del gráfico (último mes), con los 2 indicadores visibles, en
  ambos modos de escala.

Qué mirar y esperar:
- Al final de cada línea hay una etiqueta con su valor. Aunque dos líneas terminen a alturas
  parecidas, las etiquetas **no deben encimarse**: se separan verticalmente (con un conector
  fino de color cuando una fue empujada) y ninguna se sale por abajo del área.
- Cada etiqueta muestra el **valor real en personas** del último mes (el mismo número que la
  cifra de cabecera de ese indicador), **no** un valor normalizado.
- En modo "Comparar tendencias" cada etiqueta del último punto incluye el **label corto** del
  indicador seguido del valor (p. ej. `37: 1.234`), porque en ese modo las líneas pueden estar
  a la misma altura. En "Escala real" muestra solo el número.
- Cruce de control: el número de la etiqueta del último punto debe coincidir con la cifra grande
  de cabecera del indicador correspondiente.

### (e) Con 1 indicador o con 0 (desglose por situación de revista): el gráfico sigue bien

Caso 1 indicador:
- Quitar el indicador 87 (tocar la "×" de su chip). Queda solo el 37.
- Qué esperar: el toggle de escala **desaparece** (solo se muestra con ≥2 indicadores visibles).
  La única línea debe verse con su variación, con la escala real ajustada a su rango
  (no forzada a 0): la curva ocupa el alto del gráfico y se le ve la forma. El eje Y muestra
  números rotulados acordes al rango real de esa serie.

Caso 0 indicadores (modo desglose por situación de revista):
- Quitar también el indicador 37 (o usar **"Limpiar filtros"** y empezar de nuevo). Luego, sin
  fijar ningún indicador, elegir una dimensión suelta (p. ej. Carrera 37) y, opcionalmente, una
  o varias **Situaciones de revista**, y tocar **"Aplicar filtros"**.
- Qué esperar: el gráfico entra en **modo desglose**: línea **Total** destacada (con área tenue
  debajo), más una línea por situación de revista presente y la derivada "Activos y comisionados".
  Aparecen las cifras de cabecera (Dotación actual, Variación vs mes inicial, sub-cifras por estado).
  La escala Y está **ajustada al rango real** de los datos (sin forzar 0), así que la evolución
  se ve con relieve y no plana. El eje Y muestra números rotulados.

---

## Si no se pudo abrir navegador

No se ejecutó navegador en este paso. Todo lo anterior (secciones a–e) queda como **QA manual
detallada** para el usuario: seguir los pasos tal cual, en `http://localhost:5180`, con los
indicadores de código 37 y 87, y confirmar cada "Resultado esperado". El build fue verificado y
quedó verde (ver sección Build).
