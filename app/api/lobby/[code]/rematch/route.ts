import { NextRequest } from "next/server";
import { freshBalls, startMessage, type GameState } from "@/lib/game";
import { getLobby, setLobby } from "@/lib/store";
import { normalizeCode } from "@/lib/ids";
import { json, err, publicState } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/lobby/[code]/rematch  Body: { playerId }
// Both players must vote yes; then the board resets and the previous loser breaks.
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return err("Invalid body");
  }
  const playerId: string = body?.playerId;
  if (!playerId) return err("Missing playerId");

  const state = await getLobby(code);
  if (!state) return err("Lobby not found", 404);

  const idx = state.players.findIndex((p) => p && p.id === playerId);
  if (idx === -1) return err("You are not in this lobby.", 403);

  const votes: [boolean, boolean] = [...state.rematch] as [boolean, boolean];
  votes[idx] = true;

  if (votes[0] && votes[1] && state.players[0] && state.players[1]) {
    // Reset the board. The previous loser breaks (or player 0 if no winner).
    const breaker: 0 | 1 = state.winner === null ? 0 : ((state.winner ^ 1) as 0 | 1);
    const reset: GameState = {
      ...state,
      version: state.version + 1,
      status: "playing",
      turn: breaker,
      broken: false,
      open: true,
      ballInHand: false,
      balls: freshBalls(),
      lastShot: null,
      shotSeq: 0,
      winner: null,
      rematch: [false, false],
      players: [
        { ...state.players[0]!, group: null },
        { ...state.players[1]!, group: null },
      ],
    };
    reset.message = startMessage(reset);
    await setLobby(code, reset);
    return json({ state: publicState(reset) });
  }

  state.rematch = votes;
  state.version += 1;
  await setLobby(code, state);
  return json({ state: publicState(state) });
}
