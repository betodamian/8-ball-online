"use client";

import type { GameState } from "./game";
import type { Shot } from "./engine";

export type Identity = { playerId: string; index: 0 | 1 };

const idKey = (code: string) => `8ball:id:${code}`;
const NAME_KEY = "8ball:name";

export function getIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(idKey(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function setIdentity(code: string, id: Identity) {
  try {
    localStorage.setItem(idKey(code), JSON.stringify(id));
  } catch {}
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {}
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export async function createLobby(name: string): Promise<{
  code: string;
  playerId: string;
  index: 0 | 1;
  state: GameState;
}> {
  const res = await fetch("/api/lobby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parse(res);
}

export async function joinLobby(
  code: string,
  name: string,
  playerId?: string
): Promise<{ playerId: string; index: 0 | 1; state: GameState }> {
  const res = await fetch(`/api/lobby/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, playerId }),
  });
  return parse(res);
}

export async function fetchState(code: string): Promise<GameState> {
  const res = await fetch(`/api/lobby/${code}`, { cache: "no-store" });
  const data = await parse(res);
  return data.state as GameState;
}

export async function postShot(
  code: string,
  playerId: string,
  state: GameState
): Promise<{ state: GameState; stale?: boolean }> {
  const res = await fetch(`/api/lobby/${code}/shot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, state }),
  });
  return parse(res);
}

export async function postRematch(
  code: string,
  playerId: string
): Promise<{ state: GameState }> {
  const res = await fetch(`/api/lobby/${code}/rematch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId }),
  });
  return parse(res);
}

export type { GameState, Shot };
