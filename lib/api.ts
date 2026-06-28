import { NextResponse } from "next/server";
import type { GameState } from "./game";

// Strip secret player ids before sending state to clients.
export function publicState(s: GameState): GameState {
  return {
    ...s,
    players: [
      s.players[0] ? { ...s.players[0], id: "" } : null,
      s.players[1] ? { ...s.players[1], id: "" } : null,
    ],
  };
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export function err(message: string, status = 400) {
  return json({ error: message }, status);
}

export function cleanName(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const trimmed = s.trim().slice(0, 16);
  return trimmed || "Player";
}
