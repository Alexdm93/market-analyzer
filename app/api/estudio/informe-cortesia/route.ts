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
import { getBcvRate } from "@/lib/bcv";
import { CATEGORIAS, calcularDistribucion, calcularMonedaPorNivel } from "@/lib/distribucion-compensacion";
import { catalogoDelCorte, normalizarTitulo } from "@/lib/estudio-cargos";
import { tamanoDeEmpresa } from "@/lib/filtros-mercado";
import {
  generarInformeCortesia,
  mesYAnio,
  type EstadisticaMercado,
  type GrupoMercado,
  type ParticipanteInforme,
} from "@/lib/informe-cortesia";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshotIds } from "@/lib/published-snapshots";
import { safeParseCompanyInfo } from "@/lib/workspace";
import type { ExtendedMarketPosition } from "@/types/salary";

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

const TAMANO_EN_GRAFICO: Record<string, string> = {
  "pequeña": "Pequeña",
  "mediana": "Mediana",
  "grande": "Grande",
};

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

  // El Market Analyzer va agrupado por unidad funcional, que es el
  // departamento con que el cargo entró al catálogo de ESTE corte. Cada corte
  // tiene el suyo, así que no se puede leer de otro lado.
  const catalogo = await catalogoDelCorte(snapshotId);
  const unidadPorCargo = new Map<string, string>();
  const ordenDelCargo = new Map<string, number>();
  const ordenDeLaUnidad = new Map<string, number>();
  catalogo.forEach((c, i) => {
    const clave = normalizarTitulo(c.tituloCargo);
    if (!unidadPorCargo.has(clave)) {
      unidadPorCargo.set(clave, c.departamento);
      ordenDelCargo.set(clave, i);
    }
    if (!ordenDeLaUnidad.has(c.departamento)) ordenDeLaUnidad.set(c.departamento, ordenDeLaUnidad.size);
  });

  // Solo los cargos con al menos un participante, como pidió AC Consulting:
  // una lista con el catálogo entero serían páginas de "ND".
  const cargos: GrupoMercado[] = body.cargos
    .map((c) => {
      const tituloCargo = String(c.tituloCargo ?? "").trim();
      return {
        tituloCargo,
        unidadFuncional: unidadPorCargo.get(normalizarTitulo(tituloCargo)) ?? "",
        n: Number(c.n) || 0,
        cim: estadistica(c.cim),
        cimTcrP50: numeroONulo(c.cimTcrP50),
      };
    })
    .filter((c) => c.tituloCargo && c.n > 0)
    // Agrupados por unidad funcional, y dentro de cada una en el orden del
    // catálogo. Lo que no esté en el catálogo del corte cae al final.
    .sort((a, b) => {
      const ua = ordenDeLaUnidad.get(a.unidadFuncional) ?? Number.MAX_SAFE_INTEGER;
      const ub = ordenDeLaUnidad.get(b.unidadFuncional) ?? Number.MAX_SAFE_INTEGER;
      if (ua !== ub) return ua - ub;
      const ca = ordenDelCargo.get(normalizarTitulo(a.tituloCargo)) ?? Number.MAX_SAFE_INTEGER;
      const cb = ordenDelCargo.get(normalizarTitulo(b.tituloCargo)) ?? Number.MAX_SAFE_INTEGER;
      if (ca !== cb) return ca - cb;
      return a.tituloCargo.localeCompare(b.tituloCargo, "es");
    });

  if (cargos.length === 0) {
    return Response.json({ message: "Ningún cargo del corte tiene observaciones." }, { status: 400 });
  }

  // Participantes: las empresas que enviaron data. Es la misma condición que
  // da derecho al informe.
  const [enviados, posiciones, { rate: bcvGeneral }] = await Promise.all([
    prisma.userSnapshot.findMany({
      where: { snapshotId, submittedAt: { not: null } },
      select: {
        userId: true,
        companyId: true,
        company: { select: { name: true, economicSector: true, headcount: true } },
        date: true,
        label: true,
      },
      distinct: ["companyId"],
    }),
    prisma.userPosition.findMany({
      where: { snapshotId, snapshot: { submittedAt: { not: null } } },
      select: { userId: true, dataJson: true },
    }),
    getBcvRate(),
  ]);

  if (enviados.length === 0) {
    return Response.json({ message: "Ninguna empresa ha enviado data en ese corte." }, { status: 400 });
  }

  // Cada empresa convierte con la tasa que tenía al guardar, igual que el resto
  // del sistema.
  const idsDeUsuario = [...new Set([...posiciones.map((p) => p.userId), ...enviados.map((e) => e.userId)])];
  const workspaces = await prisma.userWorkspace.findMany({
    where: { userId: { in: idsDeUsuario } },
    select: { userId: true, companyInfoJson: true },
  });
  const infoPorUsuario = new Map(workspaces.map((w) => [w.userId, safeParseCompanyInfo(w.companyInfoJson)]));

  // Sector y tamaño de cada participante, para los gráficos de la hoja de
  // empresas. Manda lo que la empresa declaró al enviar su data, que es la
  // misma fuente con la que se arman los filtros de mercado; la ficha que
  // mantiene el admin queda de respaldo.
  const participantes: ParticipanteInforme[] = enviados
    .filter((e) => e.company?.name)
    .map((e) => {
      const info = infoPorUsuario.get(e.userId);
      const headcount = info?.headcount || e.company?.headcount || "";
      const tamano = tamanoDeEmpresa(headcount);
      return {
        empresa: e.company!.name,
        sector: (info?.sector || e.company?.economicSector || "").trim(),
        tamano: tamano ? TAMANO_EN_GRAFICO[tamano] : "",
      };
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "es"));

  const paraDistribucion = posiciones.flatMap((p) => {
    try {
      const info = infoPorUsuario.get(p.userId);
      return [{
        fila: JSON.parse(p.dataJson) as ExtendedMarketPosition,
        tasas: info?.tasas ?? [],
        bcv: info?.ratesAtSave?.bcvUsd ?? bcvGeneral,
      }];
    } catch {
      return [];
    }
  });

  const distribucion = calcularDistribucion(paraDistribucion).map((f) => ({
    nivel: f.nivel.toUpperCase(),
    valores: CATEGORIAS.map((c) => f.porcentajes[c]),
  }));

  const moneda = calcularMonedaPorNivel(paraDistribucion).map((f) => ({
    nivel: f.nivel.toUpperCase(),
    cuentaUSD: CATEGORIAS.map((c) => f.cuentaUSD[c]),
    pagoUSD: CATEGORIAS.map((c) => f.pagoUSD[c]),
  }));

  const snapshot = enviados[0];
  const etiqueta = snapshot?.label ?? snapshotId;

  const cliente = companyIdCliente
    ? (await prisma.company.findUnique({ where: { id: companyIdCliente }, select: { name: true } }))?.name ?? ""
    : "";

  const buffer = await generarInformeCortesia({
    tituloEstudio: `RESULTADOS ${etiqueta.toUpperCase()}`,
    cliente,
    fechaInforme: mesYAnio(new Date()),
    fechaData: mesYAnio(snapshot?.date ?? new Date()),
    participantes,
    cargos,
    distribucion,
    categoriasDistribucion: [...CATEGORIAS],
    moneda,
  });

  const nombre = cliente
    ? `Informe de cortesía - ${cliente} - ${etiqueta}.xlsx`
    : `Informe de cortesía - ${etiqueta}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
