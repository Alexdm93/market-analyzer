import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";

  if (!email) return Response.json({ companies: [] });

  const users = await prisma.user.findMany({
    where: { email },
    select: {
      company: { select: { id: true, name: true } },
    },
  });

  const seen = new Set<string>();
  const companies = users
    .map((u) => u.company)
    .filter((c): c is { id: string; name: string } => c !== null)
    .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

  return Response.json({ companies });
}
