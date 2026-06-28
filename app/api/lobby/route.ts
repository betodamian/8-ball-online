import { NextRequest } from "next/server";
import { newGame } from "@/lib/game";
import { getLobby, setLobby } from "@/lib/store";
import { generateCode, generatePlayerId } from "@/lib/ids";
import { json, err, cleanName, publicState } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/lobby  -> create a new private lobby
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const name = cleanName(body?.name);

  // Find an unused code.
  let code = "";
  for (let i = 0; i < 12; i++) {
    const c = generateCode(4);
    if (!(await getLobby(c))) {
      code = c;
      break;
    }
  }
  if (!code) return err("Could not allocate a lobby code, try again.", 500);

  const playerId = generatePlayerId();
  const state = newGame(code);
  state.players[0] = { id: playerId, name, group: null };
  state.message = "Waiting for an opponent to join…";

  await setLobby(code, state);

  return json({ code, playerId, index: 0, state: publicState(state) });
}
