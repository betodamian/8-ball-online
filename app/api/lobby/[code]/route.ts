import { NextRequest } from "next/server";
import { getLobby } from "@/lib/store";
import { normalizeCode } from "@/lib/ids";
import { json, err, publicState } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/lobby/[code] -> current public game state (polled by clients)
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  const state = await getLobby(code);
  if (!state) return err("Lobby not found", 404);
  return json({ state: publicState(state) });
}
