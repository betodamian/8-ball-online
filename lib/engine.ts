// Deterministic 2D billiards engine.
//
// Determinism matters: the player who shoots simulates the result and sends
// only the shot parameters + final state. The other client REPLAYS the same
// shot with this identical code to animate it, then snaps to the authoritative
// final state. Same inputs -> same IEEE-754 doubles -> same result.

import { Ball, BALL_R, PLAY_W, PLAY_H, POCKETS, POCKET_MOUTH } from "./table";

export const FIXED_DT = 1 / 240; // physics substep (seconds)
export const SUBSTEPS_PER_FRAME = 4; // 4 * 1/240 = 1/60s per rendered frame

const ROLL_DECEL = 260; // rolling friction deceleration (units/s^2)
const STOP_SPEED = 5; // below this a ball is considered stopped
const BALL_RESTITUTION = 0.96;
const CUSHION_RESTITUTION = 0.75;
const MAX_SPEED = 1320;
const MIN_SHOT_SPEED = 150;

export type Shot = {
  // Cue ball position the shot is taken from (supports ball-in-hand).
  cueX: number;
  cueY: number;
  angle: number; // radians, direction the cue ball travels
  power: number; // 0..1
};

export type ShotEvents = {
  firstContact: number | null; // first object ball the cue ball touched
  pocketed: number[]; // ball ids pocketed, in order
  cueScratched: boolean;
  cushionAfterContact: boolean; // any ball hit a cushion after first contact
};

// Map a 0..1 power value to an initial cue ball speed.
export function powerToSpeed(power: number): number {
  const p = Math.max(0, Math.min(1, power));
  return MIN_SHOT_SPEED + p * (MAX_SPEED - MIN_SHOT_SPEED);
}

export class Simulation {
  balls: Ball[];
  events: ShotEvents;
  private contacted = false;

  constructor(balls: Ball[]) {
    // Deep copy so we never mutate the caller's state.
    this.balls = balls.map((b) => ({ ...b }));
    this.events = {
      firstContact: null,
      pocketed: [],
      cueScratched: false,
      cushionAfterContact: false,
    };
  }

  // Apply a shot to the cue ball to begin the simulation.
  applyShot(shot: Shot) {
    const cue = this.balls.find((b) => b.id === 0);
    if (!cue) return;
    cue.x = shot.cueX;
    cue.y = shot.cueY;
    cue.pocketed = false;
    const speed = powerToSpeed(shot.power);
    cue.vx = Math.cos(shot.angle) * speed;
    cue.vy = Math.sin(shot.angle) * speed;
  }

  isMoving(): boolean {
    for (const b of this.balls) {
      if (b.pocketed) continue;
      if (b.vx * b.vx + b.vy * b.vy > STOP_SPEED * STOP_SPEED) return true;
    }
    return false;
  }

  // Advance one rendered frame (several substeps). Returns true if still moving.
  advanceFrame(): boolean {
    for (let i = 0; i < SUBSTEPS_PER_FRAME; i++) this.substep(FIXED_DT);
    return this.isMoving();
  }

  private substep(dt: number) {
    const balls = this.balls;

    // 1. Integrate motion + apply rolling friction.
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        const newSpeed = speed - ROLL_DECEL * dt;
        if (newSpeed <= STOP_SPEED) {
          b.vx = 0;
          b.vy = 0;
        } else {
          const s = newSpeed / speed;
          b.vx *= s;
          b.vy *= s;
        }
      }
    }

    // 2. Pocketing.
    for (const b of balls) {
      if (b.pocketed) continue;
      for (const p of POCKETS) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy <= p.r * p.r) {
          b.pocketed = true;
          b.vx = 0;
          b.vy = 0;
          this.events.pocketed.push(b.id);
          if (b.id === 0) this.events.cueScratched = true;
          break;
        }
      }
    }

    // 3. Cushion collisions.
    for (const b of balls) {
      if (b.pocketed) continue;
      this.cushion(b);
    }

    // 4. Ball-ball collisions.
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (c.pocketed) continue;
        this.collide(a, c);
      }
    }
  }

  private nearPocketMouth(coord: number, along: "x" | "y"): boolean {
    // True if a point at the rail is within a pocket mouth (so it shouldn't bounce).
    for (const p of POCKETS) {
      const railCoord = along === "x" ? p.x : p.y;
      if (Math.abs(coord - railCoord) < POCKET_MOUTH) return true;
    }
    return false;
  }

  private cushion(b: Ball) {
    // Left / right rails (x). Skip if aligned with a pocket mouth in y.
    if (b.x < BALL_R && b.vx < 0 && !this.nearPocketMouth(b.y, "y")) {
      b.x = BALL_R;
      b.vx = -b.vx * CUSHION_RESTITUTION;
      this.markCushion();
    } else if (b.x > PLAY_W - BALL_R && b.vx > 0 && !this.nearPocketMouth(b.y, "y")) {
      b.x = PLAY_W - BALL_R;
      b.vx = -b.vx * CUSHION_RESTITUTION;
      this.markCushion();
    }
    // Top / bottom rails (y). Skip if aligned with a pocket mouth in x.
    if (b.y < BALL_R && b.vy < 0 && !this.nearPocketMouth(b.x, "x")) {
      b.y = BALL_R;
      b.vy = -b.vy * CUSHION_RESTITUTION;
      this.markCushion();
    } else if (b.y > PLAY_H - BALL_R && b.vy > 0 && !this.nearPocketMouth(b.x, "x")) {
      b.y = PLAY_H - BALL_R;
      b.vy = -b.vy * CUSHION_RESTITUTION;
      this.markCushion();
    }
  }

  private markCushion() {
    if (this.contacted) this.events.cushionAfterContact = true;
  }

  private collide(a: Ball, c: Ball) {
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const distSq = dx * dx + dy * dy;
    const minDist = BALL_R * 2;
    if (distSq >= minDist * minDist || distSq === 0) return;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    // Positional correction: push the pair apart so they no longer overlap.
    const overlap = minDist - dist;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    c.x += nx * overlap * 0.5;
    c.y += ny * overlap * 0.5;

    // Relative velocity along the normal.
    const rvx = a.vx - c.vx;
    const rvy = a.vy - c.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn <= 0) return; // separating already

    // Equal masses: impulse j = -(1+e) * vn / 2.
    const j = ((1 + BALL_RESTITUTION) * vn) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    c.vx += j * nx;
    c.vy += j * ny;

    // Record first cue contact.
    if (!this.contacted && (a.id === 0 || c.id === 0)) {
      const other = a.id === 0 ? c.id : a.id;
      this.events.firstContact = other;
      this.contacted = true;
    }
  }
}

// Run a shot to completion synchronously. Used by the shooter to compute the
// authoritative final state (and by tests).
export function simulateToRest(
  balls: Ball[],
  shot: Shot
): { balls: Ball[]; events: ShotEvents } {
  const sim = new Simulation(balls);
  sim.applyShot(shot);
  let frames = 0;
  const MAX_FRAMES = 60 * 30; // 30s safety cap
  while (sim.advanceFrame() && frames < MAX_FRAMES) frames++;
  // Settle: ensure velocities are zeroed.
  for (const b of sim.balls) {
    b.vx = 0;
    b.vy = 0;
  }
  return { balls: sim.balls, events: sim.events };
}

// Simple aim assist: cast the cue ball straight until it would hit another ball
// or a cushion. Returns the ghost (contact) point and, if a ball, that ball id.
export function predictAim(
  balls: Ball[],
  cueX: number,
  cueY: number,
  angle: number
): { x: number; y: number; hitBall: number | null } {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let best = Infinity;
  let hitBall: number | null = null;
  let px = cueX;
  let py = cueY;

  // Against other balls (circle of radius 2R around their centers).
  for (const b of balls) {
    if (b.pocketed || b.id === 0) continue;
    const ox = b.x - cueX;
    const oy = b.y - cueY;
    const proj = ox * dirX + oy * dirY;
    if (proj <= 0) continue;
    const perp2 = ox * ox + oy * oy - proj * proj;
    const rr = (BALL_R * 2) * (BALL_R * 2);
    if (perp2 > rr) continue;
    const back = Math.sqrt(rr - perp2);
    const t = proj - back;
    if (t > 0 && t < best) {
      best = t;
      hitBall = b.id;
      px = cueX + dirX * t;
      py = cueY + dirY * t;
    }
  }

  // Against cushions (axis-aligned bounds for the ball center).
  const tx =
    dirX > 0
      ? (PLAY_W - BALL_R - cueX) / dirX
      : dirX < 0
      ? (BALL_R - cueX) / dirX
      : Infinity;
  const ty =
    dirY > 0
      ? (PLAY_H - BALL_R - cueY) / dirY
      : dirY < 0
      ? (BALL_R - cueY) / dirY
      : Infinity;
  const tWall = Math.min(tx, ty);
  if (tWall > 0 && tWall < best) {
    best = tWall;
    hitBall = null;
    px = cueX + dirX * tWall;
    py = cueY + dirY * tWall;
  }

  return { x: px, y: py, hitBall };
}
