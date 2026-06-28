import { NextRequest } from "next/server";
import type { GameState } from "@/lib/game";
import { getLobby, setLobby } from "@/lib/store";
import { normalizeCode } from "@/lib/ids";
import { json, err, publicState } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/lobby/[code]/shot
// Body: { playerId, state }  where `state` is the resolved public game state
// the shooter computed locally after running the physics.
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return err("Invalid body");
  }
  const playerId: string = body?.playerId;
  const incoming: GameState | undefined = body?.state;
  if (!playerId || !incoming) return err("Missing playerId or state");

  const current = await getLobby(code);
  if (!current) return err("Lobby not found", 404);
  if (current.status !== "playing") return err("Game is not in progress", 409);

  // Only the player whose turn it is may submit a shot.
  const shooter = current.turn;
  const seat = current.players[shooter];
  if (!seat || seat.id !== playerId) {
    return err("It is not your turn.", 403);
  }

  // Reject stale / duplicate submissions.
  if (incoming.shotSeq !== current.shotSeq + 1) {
    return json({ state: publicState(current), stale: true }, 200);
  }

  // Merge: trust gameplay fields from the client, but keep secret ids and
  // canonical names/code from the server's copy.
  const merged: GameState = {
    ...incoming,
    code: current.code,
    createdAt: current.createdAt,
    version: current.version + 1,
    shotSeq: current.shotSeq + 1,
    rematch: current.rematch,
    players: [
      current.players[0]
        ? { ...current.players[0], group: incoming.players[0]?.group ?? null }
        : null,
      current.players[1]
        ? { ...current.players[1], group: incoming.players[1]?.group ?? null }
        : null,
    ],
  };

  await setLobby(code, merged);
  return json({ state: publicState(merged) });
}
