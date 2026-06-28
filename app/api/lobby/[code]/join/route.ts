import { NextRequest } from "next/server";
import { startMessage } from "@/lib/game";
import { getLobby, setLobby } from "@/lib/store";
import { normalizeCode, generatePlayerId } from "@/lib/ids";
import { json, err, cleanName, publicState } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/lobby/[code]/join  -> take the open seat (or rejoin an existing one)
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const name = cleanName(body?.name);
  const existingId: string | undefined = body?.playerId;

  const state = await getLobby(code);
  if (!state) return err("Lobby not found", 404);

  // Rejoin: if the caller already holds one of the seats, return it.
  if (existingId) {
    const idx = state.players.findIndex((p) => p && p.id === existingId);
    if (idx !== -1) {
      return json({ playerId: existingId, index: idx, state: publicState(state) });
    }
  }

  // Take an open seat.
  const openIdx = state.players[0] ? (state.players[1] ? -1 : 1) : 0;
  if (openIdx === -1) return err("This lobby is full.", 409);

  const playerId = generatePlayerId();
  state.players[openIdx] = { id: playerId, name, group: null };

  // Both seated -> start the game.
  if (state.players[0] && state.players[1]) {
    state.status = "playing";
    state.turn = 0;
    state.message = startMessage(state);
  }
  state.version += 1;

  await setLobby(code, state);

  return json({ playerId, index: openIdx, state: publicState(state) });
}
