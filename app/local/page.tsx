"use client";

import { useState } from "react";
import Link from "next/link";
import PoolGame from "@/components/PoolGame";
import { newGame, startMessage, type GameState } from "@/lib/game";
import type { Shot } from "@/lib/engine";

function makeLocal(p1 = "Player 1", p2 = "Player 2"): GameState {
  const g = newGame("LOCAL");
  g.players[0] = { id: "", name: p1, group: null };
  g.players[1] = { id: "", name: p2, group: null };
  g.status = "playing";
  g.turn = 0;
  g.message = startMessage(g);
  return g;
}

export default function LocalPage() {
  const [state, setState] = useState<GameState>(() => makeLocal());

  const onShoot = (resolved: GameState, _shot: Shot) => setState(resolved);

  const onPlayAgain = () =>
    setState(
      makeLocal(
        state.players[0]?.name || "Player 1",
        state.players[1]?.name || "Player 2"
      )
    );

  const rename = (idx: 0 | 1, value: string) =>
    setState((s) => {
      const players = [...s.players] as GameState["players"];
      if (players[idx]) players[idx] = { ...players[idx]!, name: value.slice(0, 16) };
      return { ...s };
    });

  return (
    <div className="wrap">
      <div className="topnav">
        <Link className="brand" href="/">
          🎱 8-Ball
        </Link>
        <span className="muted" style={{ fontSize: 13 }}>
          Pass &amp; Play (local)
        </span>
      </div>

      <div className="codeBar" style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={state.players[0]?.name || ""}
          onChange={(e) => rename(0, e.target.value)}
          style={{ maxWidth: 180 }}
          aria-label="Player 1 name"
        />
        <span className="muted">vs</span>
        <input
          type="text"
          value={state.players[1]?.name || ""}
          onChange={(e) => rename(1, e.target.value)}
          style={{ maxWidth: 180 }}
          aria-label="Player 2 name"
        />
      </div>

      <PoolGame
        state={state}
        myIndex={null}
        onShoot={onShoot}
        onPlayAgain={onPlayAgain}
      />
    </div>
  );
}
