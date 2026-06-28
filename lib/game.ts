// Game state + 8-ball rules resolution.
//
// The shooter runs the physics (engine.ts), then calls `applyResolvedShot`
// with the final ball positions and shot events. This pure function decides
// fouls, group assignment, whose turn is next, and win/loss. The result is the
// new authoritative state, which is written to the store and picked up by the
// other player via polling.

import {
  Ball,
  Group,
  ballGroup,
  makeRack,
  HEAD_SPOT,
  isLegalCuePlacement,
  PLAY_W,
  PLAY_H,
  BALL_R,
} from "./table";
import { Shot, ShotEvents } from "./engine";

export type PlayerInfo = {
  id: string; // secret per-browser id (online); empty for local hotseat
  name: string;
  group: Group;
};

export type LastShot = {
  seq: number;
  by: 0 | 1;
  shot: Shot;
  fromBalls: { id: number; x: number; y: number }[];
};

export type GameState = {
  code: string;
  createdAt: number;
  version: number;
  status: "waiting" | "playing" | "ended";
  players: [PlayerInfo | null, PlayerInfo | null];
  turn: 0 | 1;
  broken: boolean; // has the opening break been taken
  open: boolean; // table open; groups not yet assigned
  ballInHand: boolean;
  balls: Ball[];
  lastShot: LastShot | null;
  shotSeq: number;
  message: string;
  winner: 0 | 1 | null;
  rematch: [boolean, boolean];
};

export function freshBalls(): Ball[] {
  return makeRack();
}

export function newGame(code: string): GameState {
  return {
    code,
    createdAt: Date.now(),
    version: 1,
    status: "waiting",
    players: [null, null],
    turn: 0,
    broken: false,
    open: true,
    ballInHand: false,
    balls: freshBalls(),
    lastShot: null,
    shotSeq: 0,
    message: "Waiting for an opponent to join…",
    winner: null,
    rematch: [false, false],
  };
}

function countRemaining(balls: Ball[], group: Group): number {
  if (!group) return 0;
  return balls.filter((b) => !b.pocketed && ballGroup(b.id) === group).length;
}

export function playerName(state: GameState, idx: 0 | 1): string {
  return state.players[idx]?.name || `Player ${idx + 1}`;
}

function groupLabel(g: Group): string {
  return g === "solids" ? "Solids" : g === "stripes" ? "Stripes" : "";
}

// Find a legal cue placement near a preferred point (used after a scratch).
function placeCue(balls: Ball[], preferX: number, preferY: number): { x: number; y: number } {
  if (isLegalCuePlacement(preferX, preferY, balls)) return { x: preferX, y: preferY };
  for (let r = BALL_R; r < PLAY_W; r += BALL_R) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = preferX + Math.cos(a) * r;
      const y = preferY + Math.sin(a) * r;
      if (isLegalCuePlacement(x, y, balls)) return { x, y };
    }
  }
  return { x: PLAY_W / 2, y: PLAY_H / 2 };
}

// Core rules resolution. `finalBalls` are the settled positions from the engine.
export function applyResolvedShot(
  prev: GameState,
  shot: Shot,
  finalBalls: Ball[],
  events: ShotEvents
): GameState {
  const shooter = prev.turn;
  const opp = (shooter ^ 1) as 0 | 1;
  const shooterGroup = prev.players[shooter]?.group ?? null;

  const fromBalls = prev.balls
    .filter((b) => !b.pocketed)
    .map((b) => ({ id: b.id, x: b.x, y: b.y }));

  const lastShot: LastShot = { seq: prev.shotSeq + 1, by: shooter, shot, fromBalls };

  const next: GameState = {
    ...prev,
    balls: finalBalls.map((b) => ({ ...b })),
    version: prev.version + 1,
    shotSeq: prev.shotSeq + 1,
    lastShot,
  };

  const wasBreak = !prev.broken;
  next.broken = true;

  const pocketedObjs = events.pocketed.filter((id) => id !== 0);
  const eightIn = events.pocketed.includes(8);
  const onEightBefore =
    !prev.open && shooterGroup !== null && countRemaining(prev.balls, shooterGroup) === 0;

  // ---- Foul detection ----
  let foul = false;
  let foulReason = "";

  if (events.cueScratched) {
    foul = true;
    foulReason = "Scratch";
  } else if (events.firstContact === null) {
    foul = true;
    foulReason = "No ball hit";
  } else if (!wasBreak) {
    // Wrong-ball-first only matters off the break.
    if (onEightBefore) {
      if (events.firstContact !== 8) {
        foul = true;
        foulReason = "Must hit the 8 first";
      }
    } else if (!prev.open) {
      if (ballGroup(events.firstContact) !== shooterGroup) {
        foul = true;
        foulReason = "Hit the wrong group first";
      }
    } else {
      // Open table: only fouls if you smack the 8 first.
      if (events.firstContact === 8) {
        foul = true;
        foulReason = "Hit the 8 first on an open table";
      }
    }
  }

  // ---- 8-ball resolution ----
  if (eightIn) {
    if (wasBreak) {
      // 8 on the break: re-rack and let the same player break again.
      const rerack = newGame(prev.code);
      return {
        ...next,
        status: "playing",
        balls: rerack.balls,
        broken: false,
        open: true,
        ballInHand: false,
        turn: shooter,
        winner: null,
        message: `8-ball on the break. Re-racking. ${playerName(prev, shooter)} breaks again.`,
      };
    }
    const legalEight = onEightBefore && !foul;
    const winner: 0 | 1 = legalEight ? shooter : opp;
    return {
      ...next,
      status: "ended",
      winner,
      ballInHand: false,
      message: legalEight
        ? `${playerName(prev, shooter)} sank the 8-ball and wins! 🎱`
        : foul
        ? `${playerName(prev, shooter)} pocketed the 8-ball on a foul. ${playerName(prev, opp)} wins!`
        : `${playerName(prev, shooter)} pocketed the 8-ball too early. ${playerName(prev, opp)} wins!`,
    };
  }

  // ---- Group assignment (only off the break, on a clean pocket) ----
  let openNow = prev.open;
  let assignedMsg = "";
  if (prev.open && !wasBreak && !foul && pocketedObjs.length > 0) {
    const g = ballGroup(pocketedObjs[0]);
    if (g) {
      next.players = [
        prev.players[0] ? { ...prev.players[0], group: shooter === 0 ? g : other(g) } : null,
        prev.players[1] ? { ...prev.players[1], group: shooter === 1 ? g : other(g) } : null,
      ];
      openNow = false;
      assignedMsg = `${playerName(prev, shooter)} is ${groupLabel(g)}. `;
    }
  }
  next.open = openNow;

  const myGroupNow = next.players[shooter]?.group ?? null;

  // Did the shooter pocket one of their own?
  let madeOwn = false;
  if (openNow) {
    // Still open (only possible on the break); any object ball counts.
    madeOwn = pocketedObjs.length > 0;
  } else {
    madeOwn = pocketedObjs.some((id) => ballGroup(id) === myGroupNow);
  }

  // ---- Cue respot on scratch ----
  if (events.cueScratched) {
    const cue = next.balls.find((b) => b.id === 0);
    if (cue) {
      const spot = placeCue(next.balls, HEAD_SPOT.x, HEAD_SPOT.y);
      cue.pocketed = false;
      cue.x = spot.x;
      cue.y = spot.y;
      cue.vx = 0;
      cue.vy = 0;
    }
  }

  // ---- Turn / ball-in-hand ----
  const shooterContinues = !foul && madeOwn;
  next.turn = shooterContinues ? shooter : opp;
  next.ballInHand = foul; // opponent gets ball-in-hand on any foul
  next.status = "playing";

  // ---- Status message ----
  const turnName = playerName(prev, next.turn);
  const turnGroup = next.players[next.turn]?.group ?? null;
  const groupSuffix = turnGroup ? ` (${groupLabel(turnGroup)})` : next.open ? " (table open)" : "";

  if (foul) {
    next.message = `${foulReason}! Ball in hand for ${turnName}${groupSuffix}.`;
  } else if (shooterContinues) {
    next.message = `${assignedMsg}${turnName} pocketed a ball, shoot again${groupSuffix}.`;
  } else {
    next.message = `${assignedMsg}${turnName}'s turn${groupSuffix}.`;
  }

  return next;
}

function other(g: Group): Group {
  return g === "solids" ? "stripes" : g === "stripes" ? "solids" : null;
}

// Build the opening message once a game becomes active.
export function startMessage(state: GameState): string {
  return `${playerName(state, state.turn)} to break.`;
}
