import type { UserWorkspacePayload } from "@/lib/workspace";

type WorkspacePatch = Partial<UserWorkspacePayload>;

async function parseWorkspaceResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (UserWorkspacePayload & { message?: string })
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload && "message" in payload && payload.message ? payload.message : "No fue posible cargar el workspace.");
  }

  return payload as UserWorkspacePayload;
}

export async function fetchWorkspace() {
  const response = await fetch("/api/workspace", {
    method: "GET",
    cache: "no-store",
  });

  return parseWorkspaceResponse(response);
}

export async function updateWorkspace(patch: WorkspacePatch) {
  const response = await fetch("/api/workspace", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  return parseWorkspaceResponse(response);
}