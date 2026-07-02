import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBcvRate, getBcvEuroRate } from "@/lib/bcv";
import { getLibreRate } from "@/lib/tcr-config";

export type TcrRatesResponse = {
  bcvUsd:    { rate: number | null; updatedAt: string | null };
  bcvEur:    { rate: number | null; updatedAt: string | null };
  libre:     { rate: number | null; updatedAt: string | null };
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const [bcvUsd, bcvEur, libre] = await Promise.all([
    getBcvRate(),
    getBcvEuroRate(),
    getLibreRate(),
  ]);

  return Response.json({ bcvUsd, bcvEur, libre } satisfies TcrRatesResponse);
}
