/**
 * El modelo CAPRI 2.0: las preguntas, sus valores y el cálculo del grado.
 *
 * Vivía dentro de `components/CapriWizardModal.tsx`, que es un componente de
 * cliente, así que el servidor no podía leerlo. Ahora lo necesitan tres sitios
 * —el asistente en pantalla, la planilla de carga que se genera en Excel y el
 * importador que la lee de vuelta— y las tres tienen que dar el mismo grado
 * para el mismo cargo. Con la tabla copiada en cada una, eso duraba hasta el
 * primer retoque.
 *
 * Los valores de cada opción NO son índices: son el grado que esa respuesta
 * aporta. Por eso la planilla numera las opciones ("1. ", "2. ") y la fórmula
 * de Excel las traduce con CHOOSE sobre esta misma lista.
 */

export const FACT_RULES: Record<number, { ej: boolean; max: number; label: string }> = {
  1: { ej: false, max: 20, label: "Hasta 500M USD" },
  2: { ej: false, max: 21, label: "500M – 5MM USD" },
  3: { ej: false, max: 22, label: "5MM – 15MM USD" },
  4: { ej: true,  max: 23, label: "15MM – 25MM USD" },
  5: { ej: true,  max: 24, label: "25MM – 50MM USD" },
  6: { ej: true,  max: 24, label: "50MM – 150MM USD" },
  7: { ej: true,  max: 25, label: "más de 150MM USD" },
};

export type Familia = "IC" | "LO" | "GE" | "EJ";

export type QuestionOpt = { value: number; title: string; desc?: string; example?: string };
export type Question    = { id: string; title: string; options: QuestionOpt[] };

export const Q: Record<Familia, Question[]> = {
  IC: [
    {
      id: "autonomia",
      title: "¿Cuánta libertad tiene para decidir CÓMO hacer su trabajo?",
      options: [
        { value: 8,  title: "Nivel Básico — Instrucciones estrictas y rutinarias",         desc: "El trabajo está detallado paso a paso. No hay margen para alterar el método." },
        { value: 9,  title: "Nivel Operativo — Rutinas estandarizadas",                   desc: "Tareas repetitivas con ligeras variaciones. Sigue reglas claras y acude al supervisor solo ante lo inusual." },
        { value: 11, title: "Nivel Técnico — Prácticas y procedimientos definidos",       desc: "El \"qué\" y el \"cómo\" están en manuales o normas del oficio. Puede organizar su día dentro de esos límites técnicos." },
        { value: 14, title: "Nivel Profesional — Supervisión por objetivos a corto plazo", desc: "Recibe metas claras pero elige los métodos estándar para alcanzarlas. Se evalúa el resultado, no el paso a paso." },
        { value: 17, title: "Nivel Especialista — Dirección general (políticas amplias)",  desc: "Trabaja bajo políticas generales del área. Define sus propios planes de acción y métodos para resolver problemas complejos." },
        { value: 19, title: "Nivel Innovación — Orientación estratégica (autonomía total)", desc: "Solo sujeto a la estrategia del negocio. Crea nuevos enfoques, métodos o servicios donde no existen precedentes." },
      ],
    },
    {
      id: "complejidad",
      title: "¿Qué tipo de esfuerzo mental exige resolver los problemas del cargo?",
      options: [
        { value: 8.5, title: "Memoria y repetición",            desc: "Problemas con solución documentada. Solo hay que recordar o leer qué hacer.",                                                         example: "Ej: cajero detecta billete falso y aplica protocolo." },
        { value: 10.5, title: "Análisis básico y elección",      desc: "Problemas recurrentes con varias causas posibles. Hay que investigar para elegir la mejor solución entre opciones conocidas.",          example: "Ej: técnico identifica falla de máquina entre 3-4 causas típicas." },
        { value: 13,   title: "Análisis técnico especializado",  desc: "Requieren interpretar datos complejos usando teoría profesional o experiencia técnica profunda.",                                       example: "Ej: ingeniero diseña solución a falla recurrente en proceso." },
        { value: 16,   title: "Pensamiento integrador",          desc: "Problemas complejos donde la solución afecta otras áreas. Requiere conectar variables distintas y diseñar soluciones que equilibran intereses.", example: "Ej: rediseño de proceso que toca operaciones, finanzas y calidad." },
        { value: 19,   title: "Pensamiento creativo / Innovación", desc: "Problemas inéditos. No hay libros ni manuales que den la respuesta; hay que conceptualizar y crear algo que no existía.",             example: "Ej: crear nuevo modelo de negocio digital desde cero." },
      ],
    },
    {
      id: "dominio",
      title: "¿Tiempo necesario para dominar el puesto?",
      options: [
        { value: 8,  title: "Menos de 6 meses" },
        { value: 9,  title: "6 meses a 1 año" },
        { value: 10, title: "1 a 2 años" },
        { value: 12, title: "2 a 4 años" },
        { value: 15, title: "4 a 7 años" },
        { value: 19, title: "Más de 7 años" },
      ],
    },
    {
      id: "formacion",
      title: "¿Cuál es el nivel académico mínimo indispensable que la empresa exige para el cargo?",
      options: [
        { value: 8.5, title: "Bachillerato" },
        { value: 11,  title: "Técnico / TSU" },
        { value: 13,  title: "Universitario / Licenciatura / Ingeniería" },
        { value: 15,  title: "Universitario + Especialización / Diplomado" },
        { value: 17,  title: "Maestría" },
        { value: 19,  title: "Doctorado / Alta Especialidad" },
      ],
    },
  ],
  LO: [
    {
      id: "tamanoEquipo",
      title: "¿Cuántas personas le reportan directamente?",
      options: [
        { value: 14, title: "1 a 5 personas" },
        { value: 15, title: "6 a 15 personas" },
        { value: 16, title: "Más de 15 personas" },
      ],
    },
    {
      id: "foco",
      title: "¿Cuál es el enfoque principal de su gestión como supervisor?",
      options: [
        { value: 14, title: "Control de Ejecución (El Día a Día)",        desc: "Su prioridad es que el turno o grupo cumpla la meta de hoy. Asigna tareas, vigila la asistencia, asegura que se sigan las normas básicas y reporta las fallas.", example: "Ej: supervisor de planta verifica turnos y controla metas diarias." },
        { value: 15, title: "Gestión Técnica y Eficiencia (El Proceso)",  desc: "Es el \"experto técnico\" del grupo. Resuelve fallas operativas, entrena al personal en cómo hacer mejor el trabajo y ajusta procesos para ganar eficiencia.", example: "Ej: supervisor rediseña flujo de despacho reduciendo tiempos un 20%." },
        { value: 16, title: "Coordinación Táctica (El Área Completa)",    desc: "Su visión va más allá de un solo turno. Articula el trabajo de varios equipos, planifica recursos a mediano plazo y negocia soluciones con otros departamentos.", example: "Ej: coordinador gestiona plan de contingencia ante caída de producción." },
      ],
    },
  ],
  GE: [
    {
      id: "tipo",
      title: "¿Cuál describe mejor el alcance de la posición gerencial?",
      options: [
        { value: 17,   title: "Liderazgo de Proceso o Sub-área",               desc: "Maneja una fracción específica dentro de un departamento más grande. Visión a corto y mediano plazo. Asegura que un proceso particular funcione adecuadamente." },
        { value: 18,   title: "Liderazgo de un Área o Departamento",           desc: "Es el responsable total de un departamento estándar. Integra varios sub-procesos bajo su mando. Visión anual." },
        { value: 19,   title: "Liderazgo de Área Compleja",                    desc: "Dirige un departamento de alto volumen, alta complejidad técnica o que es vital para la supervivencia y el giro principal del negocio." },
        { value: 20,   title: "Liderazgo Funcional (Múltiples Áreas)",         desc: "Su paraguas de control abarca varios departamentos distintos que persiguen un fin común. Define las políticas y la táctica de toda una función." },
        { value: 21,   title: "Liderazgo de Unidad de Negocio / División / Región", desc: "Dirige una división completa del negocio, una línea de productos independiente o una región geográfica." },
        { value: 22.5, title: "Liderazgo Organizacional Integrado / Dirección General", desc: "Es el máximo nivel de integración operativa de la empresa. Su visión abarca la totalidad de la operación y materializa la estrategia global." },
      ],
    },
    {
      id: "alcance",
      title: "¿Cuál es la magnitud del impacto de sus decisiones?",
      options: [
        { value: 17,   title: "Impacto Operativo Interno",                 desc: "Sus decisiones afectan la velocidad, calidad o eficiencia de su propio equipo o proceso. Los errores se corrigen internamente." },
        { value: 18,   title: "Impacto Interdepartamental",                desc: "Sus decisiones afectan el trabajo de otras áreas generando cuellos de botella o fricción interna, pero no impacta gravemente al cliente final." },
        { value: 19,   title: "Impacto en el Producto / Servicio Final",   desc: "Sus decisiones mueven la aguja del día a día del negocio. Los errores se traducen en pérdida de clientes o ingresos inmediatos." },
        { value: 20,   title: "Impacto en Ganancias y Pérdidas (G&P)",    desc: "Sus decisiones mueven la aguja de la rentabilidad. Afectan los márgenes de ganancia, los costos estructurales o el flujo de caja." },
        { value: 21.5, title: "Impacto Estratégico, Legal o Reputacional", desc: "Sus decisiones comprometen la viabilidad de la empresa. Riesgo de demandas millonarias, pérdida de licencias o crisis de relaciones públicas." },
      ],
    },
    {
      id: "pl",
      title: "¿Nivel de autonomía / libertad de acción?",
      options: [
        { value: 17.5, title: "Autonomía Operativa",       desc: "Actúa dentro de políticas, manuales y procedimientos bien definidos. Cambios estructurales deben ser aprobados por un nivel superior." },
        { value: 18.5, title: "Autonomía de Ejecución",    desc: "Tiene libertad para adaptar procesos dentro de su propia área para cumplir metas operativas específicas, sin alterar la política general del departamento." },
        { value: 19.5, title: "Autonomía Táctica",         desc: "Actúa guiado por los objetivos anuales de su área. Tiene libertad para definir métodos, planes de trabajo y uso del presupuesto de su departamento." },
        { value: 20.5, title: "Autonomía Estratégica",     desc: "Actúa bajo políticas generales del negocio. Tiene libertad para alterar procesos interdepartamentales y tomar decisiones a mediano plazo en múltiples áreas." },
        { value: 21.5, title: "Autonomía Directiva Amplia", desc: "Sujeta únicamente a directrices estratégicas muy amplias. Tiene libertad para redefinir el rumbo y la estructura de una gran división o de la empresa." },
      ],
    },
  ],
  EJ: [
    {
      id: "tipo",
      title: "¿Cuál describe mejor la naturaleza y complejidad de la dirección?",
      options: [
        { value: 23, title: "Dirección Ejecutiva Funcional / Vertical",          desc: "Lidera la estrategia a largo plazo de una función crítica o vertical completa del negocio (ej. toda la cadena de suministro). Integra múltiples áreas complejas.", example: "Ej: VP Operaciones, CFO, Director Comercial Nacional." },
        { value: 24, title: "Dirección Ejecutiva General (Unidad / Entidad)",    desc: "Máximo responsable de las Ganancias y Pérdidas (G&P) y viabilidad de una entidad de negocio completa y autosuficiente.", example: "Ej: CEO de empresa nacional, presidente de filial país." },
        { value: 25, title: "Dirección Ejecutiva Corporativa / Portafolio",      desc: "Lidera un ecosistema de negocios. Su complejidad radica en manejar un portafolio de empresas, múltiples unidades de negocio o una matriz diversa.", example: "Ej: CEO grupo multinacional, presidente regional Latam." },
      ],
    },
    {
      id: "horizonte",
      title: "¿Horizonte temporal de sus decisiones estratégicas?",
      options: [
        { value: 23, title: "3-4 años (Táctico-Estratégico)", desc: "Planificación a mediano plazo, enfocado en el ciclo de vida de productos o servicios actuales." },
        { value: 24, title: "5-7 años (Estratégico)",          desc: "Diseño del futuro del negocio, apertura de nuevos mercados o transformación del modelo de operación." },
        { value: 25, title: "Más de 7 años (Visión y Supervivencia)", desc: "Enfoque absoluto en la sostenibilidad corporativa, fusiones, adquisiciones y viabilidad generacional del grupo." },
      ],
    },
  ],
};

export const EQUIPO_OPTS: Partial<Record<Familia, { value: string; title: string }[]>> = {
  LO: [
    { value: "operativo", title: "Personal operativo / auxiliar" },
    { value: "tecnico",   title: "Técnicos profesionales" },
  ],
  GE: [
    { value: "profesional", title: "Profesionales con título universitario" },
    { value: "gerentes",    title: "Otros gerentes / supervisores" },
  ],
  EJ: [
    { value: "gerentes", title: "Otros gerentes / directores" },
    { value: "mixto",    title: "Equipo mixto de directores y profesionales senior" },
  ],
};

/** El presupuesto anual y el tamaño del equipo, que no dependen de la familia. */
export const PRESUP_OPTS = [
  { value: 1, label: "Menos de $500K" }, { value: 2, label: "$500K – $5M" },
  { value: 3, label: "$5M – $25M" },     { value: 4, label: "$25M – $100M" },
  { value: 5, label: "$100M – $500M" },  { value: 6, label: "Más de $500M" },
];

export const EQUIPO_TOTAL_OPTS = [
  { value: 1, label: "Menos de 10" }, { value: 2, label: "10 – 30" },
  { value: 3, label: "30 – 100" },    { value: 4, label: "100 – 300" },
  { value: 5, label: "300 – 1000" },  { value: 6, label: "Más de 1000" },
];

/** Cómo se llama cada familia donde la elige una persona. */
export const RUTAS: Array<{ familia: Familia; etiqueta: string }> = [
  { familia: "IC", etiqueta: "Ruta Individual" },
  { familia: "LO", etiqueta: "Liderazgo Operativo" },
  { familia: "GE", etiqueta: "Liderazgo Táctico y Estratégico" },
  { familia: "EJ", etiqueta: "Ejecutiva / Alta Dirección" },
];

export function familiaDeLaRuta(etiqueta: string): Familia | null {
  const limpia = etiqueta.trim().toLowerCase();
  return RUTAS.find((r) => r.etiqueta.toLowerCase() === limpia)?.familia ?? null;
}

/**
 * El tramo de facturación que declaró la empresa, 1 a 7. Sin dato se asume el
 * más alto: es el que no recorta nada.
 */
export function revenueToIndex(revenueUSD: string): number {
  const letter = revenueUSD.trim().toLowerCase().charAt(0);
  const map: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
  return map[letter] ?? 7;
}

/** El grado CAPRI de un cargo, ya recortado por el tramo de facturación. */
export function calcGrade(
  familia: Familia,
  calibracion: Record<string, number>,
  magnitud: { m1: number; m2: number },
  factIdx: number,
): number {
  const c = calibracion;
  let base = 0;
  if (familia === "IC") base = c.autonomia * 0.3 + c.complejidad * 0.3 + c.dominio * 0.2 + c.formacion * 0.2;
  else if (familia === "LO") base = (c.tamanoEquipo + c.foco) / 2;
  else if (familia === "GE") base = (c.tipo + c.alcance + c.pl) / 3;
  else if (familia === "EJ") base = (c.tipo + c.horizonte) / 2;

  const tot = magnitud.m1 + magnitud.m2;
  let aj = 0;
  if (familia === "GE" || familia === "EJ") {
    if (tot <= 2) aj = -1; else if (tot <= 5) aj = 0; else if (tot <= 8) aj = 1; else if (tot <= 11) aj = 2; else aj = 3;
  }

  let g = Math.floor(base + aj + 0.5);
  if (familia === "IC") g = Math.max(8,  Math.min(19, g));
  if (familia === "LO") g = Math.max(14, Math.min(16, g));
  if (familia === "GE") g = Math.max(17, Math.min(22, g));
  if (familia === "EJ") g = Math.max(23, Math.min(25, g));

  const max = FACT_RULES[factIdx]?.max ?? 25;
  return Math.min(g, max);
}

// ─── El puente con la planilla de Excel ──────────────────────────────────────

/**
 * Las opciones de una pregunta, numeradas. El número no es decoración: la
 * fórmula del archivo lo lee con LEFT() y el importador también, así que es el
 * puente entre el texto que ve la persona y el valor que vale esa respuesta.
 */
export function opcionesDeLaPregunta(pregunta: Question): string[] {
  return pregunta.options.map((o, i) => `${i + 1}. ${o.title}`);
}

export const OPCIONES_PRESUPUESTO_GE = [
  "0. No gestiona presupuesto",
  ...PRESUP_OPTS.map((o) => `${o.value}. ${o.label}`),
];
export const OPCIONES_PRESUPUESTO_EJ = PRESUP_OPTS.map((o) => `${o.value}. ${o.label}`);
export const OPCIONES_EQUIPO = EQUIPO_TOTAL_OPTS.map((o) => `${o.value}. ${o.label}`);

/**
 * Qué se pregunta en cada una de las cinco columnas de variables, por familia.
 * Las que esa familia no usa quedan vacías y su celda se deshabilita.
 */
export function columnasDeLaFamilia(familia: Familia): string[][] {
  const calibracion = Q[familia].map(opcionesDeLaPregunta);
  const magnitud =
    familia === "GE" ? [OPCIONES_PRESUPUESTO_GE, OPCIONES_EQUIPO]
    : familia === "EJ" ? [OPCIONES_PRESUPUESTO_EJ, OPCIONES_EQUIPO]
    : [];
  const todas = [...calibracion, ...magnitud];
  while (todas.length < 5) todas.push([]);
  return todas;
}

/** El número con el que empieza una opción de la planilla ("3. Universitario"). */
export function numeroDeLaOpcion(texto: string): number | null {
  const m = /^\s*(\d+)\s*\./.exec(texto ?? "");
  return m ? Number(m[1]) : null;
}

export type GradoDePlanilla = {
  familia: Familia;
  /** Null mientras falte responder alguna variable de esa ruta. */
  grado: number | null;
  /** Qué columnas de variable quedaron sin responder o con algo ilegible. */
  faltan: number[];
};

/**
 * El grado de una fila de la planilla, a partir del texto de sus celdas.
 *
 * Se calcula acá y no se cree el número que traiga la columna "Grado CAPRI":
 * esa es una fórmula del archivo, y un archivo se edita.
 */
export function gradoDesdeLaPlanilla(
  ruta: string,
  variables: string[],
  revenueUSD: string,
): GradoDePlanilla | null {
  const familia = familiaDeLaRuta(ruta);
  if (!familia) return null;

  const preguntas = Q[familia];
  const calibracion: Record<string, number> = {};
  const faltan: number[] = [];

  preguntas.forEach((pregunta, i) => {
    const n = numeroDeLaOpcion(variables[i] ?? "");
    const opcion = n !== null ? pregunta.options[n - 1] : undefined;
    if (!opcion) { faltan.push(i + 1); return; }
    calibracion[pregunta.id] = opcion.value;
  });

  // La magnitud ocupa las dos columnas siguientes a las preguntas, y solo en
  // las rutas que la usan.
  const magnitud = { m1: 0, m2: 0 };
  if (familia === "GE" || familia === "EJ") {
    const base = preguntas.length;
    const m1 = numeroDeLaOpcion(variables[base] ?? "");
    const m2 = numeroDeLaOpcion(variables[base + 1] ?? "");
    if (m1 === null) faltan.push(base + 1); else magnitud.m1 = m1;
    if (m2 === null) faltan.push(base + 2); else magnitud.m2 = m2;
  }

  if (faltan.length > 0) return { familia, grado: null, faltan };
  return { familia, grado: calcGrade(familia, calibracion, magnitud, revenueToIndex(revenueUSD)), faltan };
}
