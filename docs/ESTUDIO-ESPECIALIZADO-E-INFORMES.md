# Estudio Especializado, informes y carga masiva

Bitácora del trabajo de **septiembre de 2026**. Cubre el Estudio Especializado completo,
los dos informes en Excel, la carga masiva de data desde archivos de las empresas, los
reportes internos de revisión y el cierre de los pendientes de seguridad.

Está organizado por área y no por orden cronológico: lo que importa al retomarlo es
**dónde está cada cosa y por qué está así**, no en qué semana se hizo.

---

## 1. Mapa rápido

| Qué | Dónde | Quién lo usa |
|---|---|---|
| Respaldo y restauración de un corte | `lib/snapshot-backup-v2.ts`, `lib/snapshot-restore-v2.ts`, Admin → Respaldos | Admin |
| Candado de publicación | `lib/snapshot-lock.ts` | Automático |
| Carga masiva desde Excel | `lib/import-cargos.ts`, `/api/admin/import-template`, Admin → Importar data | Admin |
| Reportes de revisión | `lib/reportes-revision.ts`, Admin → Reportes | Admin |
| Lista propia de cargos | `lib/estudio-cargos.ts`, `/api/estudio/cargos`, menú Mis cargos | Empresa y admin |
| Equivalencias por estudio | `/api/estudio/equivalencias` | Empresa y admin |
| Comparación contra el mercado | `app/market-analyzer/estudio/comparacion` | Empresa y admin |
| Informes guardados | `lib/estudio-informes.ts`, menú Informes | Empresa y admin |
| Informe de cortesía | `lib/informe-cortesia.ts`, `lib/distribucion-compensacion.ts` | Empresa y admin |
| Informe especializado y simulador | `lib/analisis-especializado.ts`, `lib/informe-especializado.ts` | Empresa y admin |
| Límite de intentos | `lib/rate-limit.ts` | Automático |

Las plantillas de los informes viven en `templates/` y **hay que declararlas en
`next.config.ts`** (`outputFileTracingIncludes`): nadie las importa, así que el rastreo
de dependencias de Next no las ve y no viajarían en el bundle al desplegar.

---

## 2. El modelo de datos del Estudio Especializado

Tres tablas nuevas, todas independientes del flujo de captura del mercado.

### `EstudioCargo` — la fila es el OCUPANTE, no el cargo

Esto es lo más importante de entender. En el **estudio de mercado** va un cargo por
empresa, y de eso se encarga `UserPosition`, que rechaza títulos repetidos. En el
**especializado** una empresa puede tener tres analistas con sueldos distintos, y el
Análisis de Equidad Interna existe justamente para compararlos entre sí.

Por eso `EstudioCargo` **no** tiene único por título. Tiene `ocupanteId` opcional (el
`TEALCA-001` de los modelos) con su propio índice único. Es nullable y no cadena vacía
porque en Postgres los nulos no chocan entre sí en un índice único.

La compensación va en `dataJson` con **la misma forma que `UserPosition.dataJson`**. Eso
es lo que permite reusar sin cambios el cálculo de totales, el asistente CAPRI y el
lector de Excel. No hay dos modelos de compensación: hay uno.

### `EstudioEquivalencia` — la homologación es del CARGO

Llave `(companyId, tituloCargoKey, snapshotId)`, con el título normalizado. Va por cargo
y no por ocupante: los tres analistas comparan todos contra el mismo cargo del catálogo.
Guardarla por persona obligaría a homologar tres veces y dejaría que quedaran distintas
entre sí.

Es **por corte** porque cada corte tiene su propio catálogo (`snapshot-cargos-{id}`).

Al borrar un ocupante, la equivalencia solo se pierde si era el último de ese cargo
(`limpiarEquivalenciasHuerfanas`).

### `EstudioInforme` — una foto congelada

Guarda **los números**, no referencias a los cargos. Si después se corrige un sueldo o se
republica el corte, el informe entregado sigue diciendo lo mismo; para tenerlo al día se
genera otro.

Por eso las cifras las manda la pantalla que acaba de mostrarlas y **no se recalculan al
guardar**: recalcular sería lo contrario de congelar. El servidor valida pertenencia,
forma y tamaño (`MAX_FILAS_INFORME = 500`), no los montos.

---

## 3. Los dos informes en Excel

### El enfoque: rellenar la plantilla del cliente, no generar un libro

Ambos informes **parten del archivo que armó el cliente** (`templates/`) y solo escriben
las celdas de datos. Así conservan portada, páginas institucionales, logos y diseño.

Esto se verificó antes de comprometerse, no se asumió:

| | Cortesía (`.xlsx`) | Especializado (`.xlsm`) |
|---|---|---|
| Hojas | 11, conservadas | 25, conservadas |
| Imágenes y formas | 13, conservadas | 24, conservadas |
| Formato de celda | Se conserva al cambiar solo el valor | Igual |
| Macros | No tiene | **Se pierden** (decidido descartarlas) |
| Gráfico nativo | No tiene | **Se pierde** (uno, en Análisis de Dispersión) |

El especializado sale como `.xlsx` porque exceljs no conserva VBA. Las macros eran una
comodidad para propagar la configuración de comisiones entre hojas, y acá la
configuración se escribe ya aplicada.

### Informe de cortesía

Lo recibe toda empresa que participó y **envió** su data. El servidor comprueba ambas
condiciones: corte publicado y data enviada.

Contenido: portada, empresas participantes, distribución de compensación y la tabla de
Market Analyzer con las cuatro métricas (TEM, TEMz, CIM, PCTA).

**El contenido es idéntico para todas las empresas.** Lo único propio de cada una es el
nombre en la portada, que se agregó en A18/B18 —las mismas celdas donde lo lleva el
especializado— porque la plantilla original no tenía campo de cliente. Que cada empresa
vea su propio posicionamiento quedó planteado y **sin hacer**.

La **distribución de compensación** usa ocho categorías definidas por el CEO, que
reemplazan a las de la plantilla. Las viejas ("Fondo de Ahorros", "Otros pagos
adicionales") dependían de cómo cada empresa nombrara sus conceptos y no eran
calculables. Las nuevas salen de la estructura del dato:

- **Fijos**: sueldo base · bono alimentación · otros mensuales con impacto · otros
  mensuales sin impacto · otros de otra frecuencia con impacto · otros de otra
  frecuencia sin impacto
- **Variables**: por desempeño · por comisión (sin mirar frecuencia ni impacto)

Todo se lleva a USD mensualizado **con la tasa que cada empresa tenía al guardar** antes
de sumar. Si no, una empresa que paga en bolívares distorsionaría los porcentajes de su
nivel.

Los niveles son los **seis del CAPRI**, no los siete de la plantilla.

### Informe especializado y simulador

`lib/analisis-especializado.ts` calcula los cuatro análisis desde una sola base: la
compensación de cada ocupante bajo el concepto elegido.

Esa compensación **no se calcula a mano**: se reusa `computeRowTotals`. Para excluir
comisiones se ponen en cero antes de llamarlo, en vez de rehacer la suma, para que no
pueda divergir del cálculo canónico.

- **Equidad interna** — banda por grado (la media de sus ocupantes abierta por la mitad
  de la apertura configurada), resultado e índice.
- **Competitividad** — contra los percentiles 90/75/50/25/10 del grado, con la diferencia.
- **Mapa de calor** — los mismos percentiles con su margen, y el compa-ratio.
- **Mapeo de cargos** — la cuadrícula de grado × área funcional.
- **Simulador** — ver abajo.

#### La fórmula del simulador es un supuesto mío

**No estaba en ningún insumo.** Se armó con los tres parámetros que trae la plantilla:

1. La *Variación General* es la base.
2. Sube un *Delta* por cada tramo que el índice compuesto esté por debajo de la paridad.
3. El desempeño suma otro escalón por calificación, con "Insatisfactorio" en cero.
4. La *Variación Máxima* es el tope de todo.

El índice compuesto promedia la posición frente al mercado (compa-ratio) y frente a los
pares del mismo grado (índice de equidad).

**Si la fórmula real del negocio es otra, hay que cambiarla acá.**

---

## 4. Carga masiva desde Excel

Plantilla generada por corte, con los cargos del catálogo ya escritos y **desplegables
reales** (se genera con exceljs y no con xlsx, que no sabe escribir validación de datos).
La lectura sí usa xlsx, en el navegador.

La escritura reutiliza `PUT /api/workspace?companyId=…`, el mismo camino que la pantalla
de Data. No hay una ruta de escritura aparte que pueda dejar la data en un estado que el
resto del sistema no entienda.

Reglas que impone el resto del sistema y que el lector respeta:

- El par (departamento, cargo) **tiene que existir en el catálogo del corte**. Si no, la
  pantalla de Data borra la fila la próxima vez que la empresa entra.
- No puede repetirse el mismo cargo en una empresa: el servidor rechaza el guardado
  completo.
- Una celda vacía **no conserva** lo que la empresa tenga cargado: toma el valor por
  defecto. **La excepción es el grado CAPRI**, que se hereda del cargo existente cuando
  el archivo no lo trae — si no, importar borraría clasificaciones hechas a mano.
- El archivo declara **de qué empresa es** en la hoja de instrucciones, y la carga se
  **bloquea** si no coincide con la empresa elegida. Cargar los sueldos de una empresa en
  otra es irreversible y silencioso.

La plantilla **solo pide lo que la pantalla de Data deja editar**. Ver la sección de
campos muertos más abajo.

---

## 5. Seguridad

### Cerrados

- **Respaldo v1 eliminado.** `app/api/admin/backups/route.ts` y `lib/snapshot-backup.ts`
  quedaron huérfanos tras F0 pero el endpoint seguía vivo, y su restauración era no
  atómica y sin validar: un camino de pérdida de data accesible por URL.
- **Límite de intentos persistente.** Vivía en un `Map` en memoria, o sea por instancia
  de Vercel. Ahora en `GlobalConfig` con prefijo `ratelimit:`. **Si la base falla, deja
  pasar**: bloquear el login por un fallo del limitador sería peor que no limitar un rato.
  Dos topes distintos: login 10, búsqueda de empresa por correo 60 (esa se dispara sola,
  dos veces por intento, y varias personas comparten la IP de una oficina).
- **Concurrencia optimista** en el guardado del admin a nombre de una empresa. Ese camino
  arma su payload sobre una lectura que puede tener minutos. El cliente manda
  `baseUpdatedAt` y el servidor responde **409** si no coincide. **El guardado propio de
  la empresa no se tocó.**

### Abierto a propósito

- **Carrera del primer admin** (`/api/register`). Solo importaba con la base vacía; hoy no
  es explotable.

---

## 6. Migraciones aplicadas

Todas se corrieron a mano en el SQL Editor de Supabase, porque el puerto 5432 está
bloqueado desde local. Están en `prisma/migrations/`. **Nunca correr `prisma db push`**:
sincroniza el esquema borrando lo que no coincide.

| Migración | Qué hace |
|---|---|
| `20260920_add_estudio_cargos` | Crea `EstudioCargo` y `EstudioEquivalencia` |
| `20260920_add_estudio_informes` | Crea `EstudioInforme` |
| `20260920_estudio_por_ocupante` | Quita el único por título, agrega `ocupanteId`, recrea `EstudioEquivalencia` por cargo |
| `20260920_estudio_reporta_a` | Agrega `reportaA` |

Todas son idempotentes. La de por-ocupante lleva un guardia que **aborta si
`EstudioEquivalencia` tuviera filas**, porque recrea esa tabla.

Detalle para verificaciones futuras: `CREATE UNIQUE INDEX` crea un **índice**, no una
constraint, así que los índices únicos **no aparecen en `pg_constraint`** — hay que mirar
`pg_indexes`.

---

## 7. Campos muertos: leer antes de agregar algo a un formulario

Hay campos en el modelo que **se leen en algún endpoint pero no los escribe ninguna
pantalla**. Siempre vienen vacíos, y pedirlos en un Excel o en un formulario es ofrecer
algo que no cambia nada:

| Campo | Situación |
|---|---|
| `row.descripcion` | La Descripción que se ve en Data es de solo lectura y sale del catálogo global `position-descriptions` |
| `row.clasificacion`, `row.nivelOrganizacional` | Se leen en `/api/admin/study` y `/api/admin/dashboard`; no los escribe nada. Lo que clasifica de verdad un cargo es el CAPRI |
| `bonoMovilizacion`, `bonoDesempeno`, `comisiones`, `pagoVariableOtros` | **Suman en los totales** pero no tienen interfaz en Data. Puede haber data vieja con valores. Los reportes de revisión los muestran a propósito, justamente para detectarlos. Lo nuevo va por conceptos adicionales, que sí se ven |

También hay campos **fijos** en la pantalla y que por eso no se piden: la frecuencia del
sueldo básico y del bono de alimentación es siempre mensual, y su impacto en prestaciones
está fijo (el sueldo sí impacta, el bono no).

---

## 8. Trampas conocidas

**`tsc` no detecta los cambios de contrato entre pantalla y API.** Cuando se cambió la
llave de las equivalencias, la pantalla seguía mandando `estudioCargoId` dentro de un
cuerpo JSON sin tipar: compilaba perfecto y habría roto en ejecución. Al cambiar la llave
de un endpoint, hay que revisar a mano quién lo llama.

**Las plantillas tienen filas que parecen datos y no lo son.** En el simulador, los datos
empiezan en la **fila 17**: las 15 y 16 son la leyenda de desempeño. Escribir en la 15 la
borraba. Y "% de Ajuste por Índice" no es una columna sino **cuatro** (L–O), una por
calificación; R, S y T no se tocan porque R lo llena el cliente y S y T lo resuelven.

**En el mapeo de cargos hay que deshacer y rehacer las combinaciones.** Las 119 que trae
la plantilla están atadas a la estructura del cliente del ejemplo. Y hay que limpiar
también la **fila separadora** entre bandas de grado, o se asoman sus datos.

**No cortar JSX por texto.** Ya rompió el archivo una vez: `s.index("      )}")` coincidió
con un `)}` más anidado. Si hay que hacerlo, usar un ancla única y verificar después.

**El guardado del admin borra y recrea.** `PUT /api/workspace?companyId=` borra todas las
posiciones y snapshots de la empresa y los reescribe desde el payload, así que hay que
mandarlos **completos**. Los estados (`submittedAt`, `status`, `processedAt`) se leen
antes de borrar; si no, se pierden.

---

## 9. Pendientes

**Sin probar contra datos reales.** Once fases apiladas. Lo más importante de verificar:
que los percentiles de Comparación coincidan con los de Resultados para la misma empresa y
corte, y que el informe de cortesía dé cifras creíbles.

**Decisiones esperando al negocio:**

- La fórmula de reparto del simulador (sección 3).
- El gráfico de la hoja de Dispersión se pierde; sin respuesta sobre si recuperarlo.
- Que el informe de cortesía muestre el posicionamiento propio de cada empresa (opción B).
- Las secciones que se sacaron del índice del cortesía van como informe aparte, sin hacer.

**Técnicos:**

- La columna "Desempeño" del simulador queda vacía: no capturamos ese dato.
- Si una empresa tiene más ocupantes que las filas con fórmula de la plantilla del
  simulador, las extra no traen fórmula en S y T.
- Carrera del primer admin, abierta a propósito.
