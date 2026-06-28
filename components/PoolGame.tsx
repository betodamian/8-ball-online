"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Ball, BALL_R, PLAY_W, PLAY_H, isLegalCuePlacement } from "@/lib/table";
import {
  Simulation,
  simulateToRest,
  predictAim,
  type Shot,
} from "@/lib/engine";
import { applyResolvedShot, playerName, type GameState } from "@/lib/game";
import {
  drawTable,
  CANVAS_W,
  CANVAS_H,
  RAIL,
  type AimInfo,
} from "@/components/draw";

const MAX_PULL = 230; // logical units of pull-back = full power
const SHOOT_THRESHOLD = 0.06;

type Props = {
  state: GameState;
  myIndex: 0 | 1 | null; // null = local hotseat (current player always controls)
  onShoot: (resolved: GameState, shot: Shot) => void;
  onRematch?: () => void;
  onPlayAgain?: () => void;
  topSlot?: ReactNode;
  busy?: boolean;
};

export default function PoolGame({
  state,
  myIndex,
  onShoot,
  onRematch,
  onPlayAgain,
  topSlot,
  busy,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const displayBallsRef = useRef<Ball[]>(state.balls.map((b) => ({ ...b })));
  const appliedSeqRef = useRef<number>(state.shotSeq);
  const aimRef = useRef<AimInfo>(null);
  const cuePosRef = useRef<{ x: number; y: number }>(getCue(state.balls));
  const placingRef = useRef(false);
  const placeValidRef = useRef(true);
  const aimingRef = useRef(false);
  const animatingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const [animating, setAnimating] = useState(false);
  const [powerPct, setPowerPct] = useState(0);

  const controllingIndex: 0 | 1 = myIndex === null ? state.turn : myIndex;
  const isMyTurn = state.status === "playing" && state.turn === controllingIndex;
  const canControl = isMyTurn && !animating && !busy;
  const canControlRef = useRef(canControl);
  canControlRef.current = canControl;

  // ---- painting ----
  const paint = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const st = stateRef.current;
    drawTable(ctx, {
      balls: displayBallsRef.current,
      aim: aimRef.current,
      ballInHand: st.ballInHand && canControlRef.current,
      placing: placingRef.current,
      placeValid: placeValidRef.current,
    });
  }, []);

  const syncCuePos = useCallback(() => {
    cuePosRef.current = getCue(displayBallsRef.current);
  }, []);

  // ---- canvas sizing ----
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(CANVAS_W * dpr);
      canvas.height = Math.round(CANVAS_H * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      paint();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [paint]);

  // ---- animation / state reconciliation ----
  const runAnimation = useCallback(
    (
      fromBalls: { id: number; x: number; y: number }[],
      shot: Shot,
      finalBalls: Ball[],
      seq: number
    ) => {
      const present: Ball[] = fromBalls.map((fb) => ({
        id: fb.id,
        x: fb.x,
        y: fb.y,
        vx: 0,
        vy: 0,
        pocketed: false,
      }));
      const sim = new Simulation(present);
      sim.applyShot(shot);
      animatingRef.current = true;
      setAnimating(true);
      aimRef.current = null;
      setPowerPct(0);

      const step = () => {
        const moving = sim.advanceFrame();
        displayBallsRef.current = sim.balls;
        paint();
        if (moving) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          displayBallsRef.current = finalBalls.map((b) => ({ ...b }));
          appliedSeqRef.current = seq;
          animatingRef.current = false;
          setAnimating(false);
          syncCuePos();
          paint();
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [paint, syncCuePos]
  );

  useEffect(() => {
    if (animatingRef.current) return;
    const seq = state.shotSeq;
    if (state.lastShot && seq === appliedSeqRef.current + 1) {
      runAnimation(state.lastShot.fromBalls, state.lastShot.shot, state.balls, seq);
    } else if (seq !== appliedSeqRef.current) {
      displayBallsRef.current = state.balls.map((b) => ({ ...b }));
      appliedSeqRef.current = seq;
      syncCuePos();
      paint();
    } else {
      paint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  // ---- input ----
  function toLogical(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = CANVAS_W / rect.width;
    const sy = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * sx - RAIL,
      y: (e.clientY - rect.top) * sy - RAIL,
    };
  }

  function updateAim(p: { x: number; y: number }) {
    const cue = cuePosRef.current;
    const dx = cue.x - p.x;
    const dy = cue.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return;
    const angle = Math.atan2(dy, dx);
    const power = Math.max(0, Math.min(1, dist / MAX_PULL));
    const ghost = predictAim(displayBallsRef.current, cue.x, cue.y, angle);
    aimRef.current = {
      cueX: cue.x,
      cueY: cue.y,
      angle,
      power,
      ghostX: ghost.x,
      ghostY: ghost.y,
    };
    setPowerPct(Math.round(power * 100));
    paint();
  }

  function updatePlace(p: { x: number; y: number }) {
    const x = Math.max(BALL_R, Math.min(PLAY_W - BALL_R, p.x));
    const y = Math.max(BALL_R, Math.min(PLAY_H - BALL_R, p.y));
    const valid = isLegalCuePlacement(x, y, displayBallsRef.current);
    placeValidRef.current = valid;
    cuePosRef.current = { x, y };
    const cue = displayBallsRef.current.find((b) => b.id === 0);
    if (cue) {
      cue.x = x;
      cue.y = y;
      cue.pocketed = false;
    }
    paint();
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canControlRef.current) return;
    const p = toLogical(e);
    const cue = cuePosRef.current;
    const grabbingCue =
      stateRef.current.ballInHand &&
      Math.hypot(p.x - cue.x, p.y - cue.y) <= BALL_R * 1.9;
    if (grabbingCue) {
      placingRef.current = true;
      updatePlace(p);
    } else {
      aimingRef.current = true;
      updateAim(p);
    }
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {}
  }

  function onPointerMove(e: React.PointerEvent) {
    if (placingRef.current) updatePlace(toLogical(e));
    else if (aimingRef.current) updateAim(toLogical(e));
  }

  function onPointerUp() {
    if (placingRef.current) {
      placingRef.current = false;
      if (!placeValidRef.current) {
        // Revert to a legal spot near the attempted placement.
        syncCuePos();
        const cue = displayBallsRef.current.find((b) => b.id === 0);
        const fixed = nearestLegal(cuePosRef.current, displayBallsRef.current);
        if (cue) {
          cue.x = fixed.x;
          cue.y = fixed.y;
        }
        cuePosRef.current = fixed;
        placeValidRef.current = true;
      }
      paint();
      return;
    }
    if (aimingRef.current) {
      aimingRef.current = false;
      const aim = aimRef.current;
      if (aim && aim.power >= SHOOT_THRESHOLD) {
        doShoot(aim.angle, aim.power);
      } else {
        aimRef.current = null;
        setPowerPct(0);
        paint();
      }
    }
  }

  function doShoot(angle: number, power: number) {
    const pre = stateRef.current;
    const cue = cuePosRef.current;
    const shot: Shot = { cueX: cue.x, cueY: cue.y, angle, power };
    aimRef.current = null;
    setPowerPct(0);
    const { balls: finalBalls, events } = simulateToRest(pre.balls, shot);
    const resolved = applyResolvedShot(pre, shot, finalBalls, events);
    onShoot(resolved, shot);
  }

  // ---- HUD data ----
  const solidsLeft = state.balls.filter(
    (b) => !b.pocketed && b.id >= 1 && b.id <= 7
  ).length;
  const stripesLeft = state.balls.filter(
    (b) => !b.pocketed && b.id >= 9 && b.id <= 15
  ).length;

  const turnLabel =
    state.status === "ended"
      ? "Game over"
      : state.status === "waiting"
      ? "Waiting…"
      : isMyTurn
      ? myIndex === null
        ? `${playerName(state, state.turn)} to shoot`
        : "Your turn"
      : myIndex === null
      ? ""
      : `${playerName(state, state.turn)}'s turn`;

  return (
    <div className="game">
      {topSlot}
      <div className="players">
        <PlayerCard
          state={state}
          idx={0}
          you={myIndex === 0}
          solidsLeft={solidsLeft}
          stripesLeft={stripesLeft}
        />
        <div className="vs">
          <span>VS</span>
          {turnLabel && <small>{turnLabel}</small>}
        </div>
        <PlayerCard
          state={state}
          idx={1}
          you={myIndex === 1}
          solidsLeft={solidsLeft}
          stripesLeft={stripesLeft}
          right
        />
      </div>

      <div className="messageBar">{state.message}</div>

      <div className="tableWrap" style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
        <canvas
          ref={canvasRef}
          className="poolCanvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "none", cursor: canControl ? "crosshair" : "default" }}
        />

        {state.status === "waiting" && (
          <div className="overlay">
            <div className="overlayCard">
              <h3>Waiting for an opponent…</h3>
              <p>Share your join code so a friend can hop in.</p>
            </div>
          </div>
        )}

        {state.status === "ended" && (
          <div className="overlay">
            <div className="overlayCard">
              <h3>
                {state.winner !== null
                  ? `${playerName(state, state.winner)} wins! 🎱`
                  : "Game over"}
              </h3>
              {myIndex === null ? (
                <button className="btn primary" onClick={onPlayAgain}>
                  Play again
                </button>
              ) : (
                <>
                  <button className="btn primary" onClick={onRematch} disabled={busy}>
                    {state.rematch[controllingIndex] ? "Waiting for opponent…" : "Rematch"}
                  </button>
                  <p className="rematchVotes">
                    Rematch: {state.rematch.filter(Boolean).length}/2 ready
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="powerMeter" aria-hidden>
          <div className="powerFill" style={{ width: `${powerPct}%` }} />
          <span className="powerText">{powerPct ? `${powerPct}%` : "Power"}</span>
        </div>
        <p className="hint">
          {state.status !== "playing"
            ? " "
            : !isMyTurn
            ? myIndex === null
              ? ""
              : "Waiting for your opponent to shoot…"
            : state.ballInHand
            ? "Ball in hand. Drag the white ball to reposition, then drag back anywhere to aim and shoot."
            : "Drag back from the cue ball and release to shoot. Pull farther for more power."}
        </p>
      </div>
    </div>
  );
}

function PlayerCard({
  state,
  idx,
  you,
  solidsLeft,
  stripesLeft,
  right,
}: {
  state: GameState;
  idx: 0 | 1;
  you: boolean;
  solidsLeft: number;
  stripesLeft: number;
  right?: boolean;
}) {
  const p = state.players[idx];
  const active = state.status === "playing" && state.turn === idx;
  const group = p?.group ?? null;
  const left =
    group === "solids" ? solidsLeft : group === "stripes" ? stripesLeft : null;
  return (
    <div className={`playerCard${active ? " active" : ""}${right ? " right" : ""}`}>
      <div className="pcName">
        {p?.name || `Player ${idx + 1}`}
        {you && <span className="youTag">you</span>}
      </div>
      <div className="pcGroup">
        {group ? (
          <>
            <span className={`groupDot ${group}`} />
            {group === "solids" ? "Solids" : "Stripes"} · {left} left
          </>
        ) : (
          <span className="muted">open table</span>
        )}
      </div>
    </div>
  );
}

function getCue(balls: Ball[]): { x: number; y: number } {
  const c = balls.find((b) => b.id === 0);
  return c ? { x: c.x, y: c.y } : { x: PLAY_W * 0.25, y: PLAY_H / 2 };
}

function nearestLegal(
  pref: { x: number; y: number },
  balls: Ball[]
): { x: number; y: number } {
  if (isLegalCuePlacement(pref.x, pref.y, balls)) return pref;
  for (let r = BALL_R; r < PLAY_W; r += BALL_R) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      const x = pref.x + Math.cos(a) * r;
      const y = pref.y + Math.sin(a) * r;
      if (isLegalCuePlacement(x, y, balls)) return { x, y };
    }
  }
  return { x: PLAY_W / 2, y: PLAY_H / 2 };
}
