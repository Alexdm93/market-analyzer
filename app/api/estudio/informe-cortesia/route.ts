/**
 * Genera el informe de cortesía de un corte, rellenando la plantilla del cliente.
 *
 * Los percentiles los manda quien llama y no se recalculan acá: vienen de
 * `/api/percentiles` y `/api/percentiles-tcr`, que son las rutas que alimentan
 * el estudio de cortesía en pantalla. Recalcularlos por separado abriría la
 * puerta a que el informe y Resultados dijeran cosas distintas.
 *
 * La distribución de compensación sí se calcula acá, porque no existe en
 * ninguna pantalla: es un desglose por categoría que solo usa este informe.
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { promedioLibre } from "@/lib/compensation";
import { CATEGORIAS } from "@/lib/distribucion-compensacion";
import { CorteSinDatos, reunirDatosDelCorte } from "@/lib/datos-del-corte";
import { normalizarTitulo } from "@/lib/estudio-cargos";
import {
  generarInformeCortesia,
  mesYAnio,
  type EstadisticaMercado,
  type GrupoMercado,
} from "@/lib/informe-cortesia";
import { calcularPercentilesTcr } from "@/lib/percentiles-mercado";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";

export const maxDuration = 60;

type Cuerpo = { snapshotId?: string; companyId?: string; cargos?: Array<Record<string, unknown>> };

function numeroONulo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function estadistica(v: unknown): EstadisticaMercado {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    p50: numeroONulo(o.p50), promedio: numeroONulo(o.promedio),
    min: numeroONulo(o.min), max: numeroONulo(o.max),
  };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  const snapshotId = body?.snapshotId?.trim() ?? "";
  if (!snapshotId) return Response.json({ message: "Indica el corte." }, { status: 400 });

  const esAdmin = session.user.role === "ADMIN";

  // El admin puede generarlo para cualquier empresa, o genérico sin ninguna.
  // Una empresa solo descarga el suyo, y solo si se lo ganó: el corte tiene que
  // estar publicado y ella tiene que haber enviado su data. Son las dos mismas
  // condiciones que dan derecho al informe.
  const companyIdCliente = esAdmin ? (body?.companyId?.trim() ?? "") : (session.user.companyId ?? "");

  if (!esAdmin) {
    if (!companyIdCliente) {
      return Response.json({ message: "Tu usuario no tiene empresa asignada." }, { status: 400 });
    }
    const [publicados, envio] = await Promise.all([
      getPublishedSnapshotIds(),
      prisma.userSnapshot.findFirst({
        where: { snapshotId, companyId: companyIdCliente, submittedAt: { not: null } },
        select: { id: true },
      }),
    ]);
    if (!publicados.includes(snapshotId)) {
      return Response.json({ message: "Ese corte todavía no está publicado." }, { status: 403 });
    }
    if (!envio) {
      return Response.json(
        { message: "El informe es para las empresas que enviaron su data en este corte." },
        { status: 403 },
      );
    }
  }
  if (!Array.isArray(body?.cargos) || body.cargos.length === 0) {
    return Response.json({ message: "El informe no trae cargos." }, { status: 400 });
  }

  let datos;
  try {
    datos = await reunirDatosDelCorte(snapshotId);
  } catch (e) {
    if (e instanceof CorteSinDatos) return Response.json({ message: e.message }, { status: 400 });
    throw e;
  }

  // Solo los cargos que tienen algo que mostrar.
  //
  // Todas las columnas de la tabla —TCR, P50, promedio, mínimo y máximo—
  // exigen las mismas observaciones mínimas, así que una fila sin mediana sale
  // en "ND" de punta a punta: ocupa el renglón para no decir nada. Se deja
  // fuera del informe (AC Consulting, 2026-09-27).
  const cargos: GrupoMercado[] = body.cargos
    .map((c) => {
      const tituloCargo = String(c.tituloCargo ?? "").trim();
      return {
        tituloCargo,
        unidadFuncional: datos.unidadFuncionalDe(tituloCargo),
        n: Number(c.n) || 0,
        cim: estadistica(c.cim),
        // Se llena más abajo, con el mercado en TCR.
        cimTcrP50: null as number | null,
      };
    })
    .filter((c) => c.tituloCargo && c.n > 0 && c.cim.p50 !== null)
    .sort(datos.compararCargos);

  if (cargos.length === 0) {
    return Response.json(
      { message: "Ningún cargo del corte reúne las observaciones mínimas para publicarse." },
      { status: 400 },
    );
  }

  const { bcv, bcvEur, binance, libreManual } = datos.tasas;

  // La columna "P50 - TCR BCV-USD": el mercado del corte completo, sin filtros.
  // Se calcula acá y no en el navegador porque si la llamada fallaba, la
  // columna salía "ND" en todas las filas sin que nadie se enterara.
  const tcrPorCargo = new Map<string, number | null>();
  if (bcv || promedioLibre(binance, bcvEur) || libreManual) {
    const mercadoTcr = calcularPercentilesTcr({
      snapshotId,
      tcrType: "bcv",
      filtros: { sectores: [], clasificaciones: [], empresas: [], localidades: [], tamanos: [] },
      workspaces: datos.workspaces,
      globales: datos.tasas,
    });
    for (const c of mercadoTcr.cargos) {
      tcrPorCargo.set(normalizarTitulo(c.tituloCargo), c.conPasivosMensual.p50 ?? null);
    }
  }
  for (const cargo of cargos) {
    cargo.cimTcrP50 = tcrPorCargo.get(normalizarTitulo(cargo.tituloCargo)) ?? null;
  }

  const cliente = companyIdCliente
    ? (await prisma.company.findUnique({ where: { id: companyIdCliente }, select: { name: true } }))?.name ?? ""
    : "";

  const buffer = await generarInformeCortesia({
    tituloEstudio: `RESULTADOS ${datos.etiqueta.toUpperCase()}`,
    cliente,
    fechaInforme: mesYAnio(new Date()),
    fechaData: mesYAnio(datos.fechaData),
    participantes: datos.participantes,
    cargos,
    distribucion: datos.distribucion,
    categoriasDistribucion: [...CATEGORIAS],
    moneda: datos.moneda,
  });

  const nombre = cliente
    ? `Informe de cortesía - ${cliente} - ${datos.etiqueta}.xlsx`
    : `Informe de cortesía - ${datos.etiqueta}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
