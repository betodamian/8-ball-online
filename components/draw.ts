// Pure canvas drawing for the pool table. All coordinates are in logical table
// space (playfield 0..PLAY_W / 0..PLAY_H) offset by RAIL.

import {
  Ball,
  BALL_R,
  BALL_COLORS,
  PLAY_W,
  PLAY_H,
  POCKETS,
  ballGroup,
} from "@/lib/table";

export const RAIL = 30;
export const CANVAS_W = PLAY_W + RAIL * 2;
export const CANVAS_H = PLAY_H + RAIL * 2;

export type AimInfo = {
  cueX: number;
  cueY: number;
  angle: number;
  power: number; // 0..1
  ghostX: number;
  ghostY: number;
} | null;

export type DrawState = {
  balls: Ball[];
  aim: AimInfo;
  ballInHand: boolean;
  placing: boolean;
  placeValid: boolean;
};

const ox = RAIL;
const oy = RAIL;

export type DrawOpts = {
  portrait: boolean;
  dpr: number;
  bufferW: number;
  bufferH: number;
};

export function drawTable(
  ctx: CanvasRenderingContext2D,
  s: DrawState,
  opts: DrawOpts
) {
  // Clear the full device buffer, then set up the drawing transform. In
  // portrait we rotate the whole landscape table 90deg clockwise so the long
  // axis runs vertically down the screen.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, opts.bufferW, opts.bufferH);
  ctx.scale(opts.dpr, opts.dpr);
  if (opts.portrait) {
    ctx.translate(CANVAS_H, 0);
    ctx.rotate(Math.PI / 2);
  }

  // Outer wooden frame.
  roundRect(ctx, 0, 0, CANVAS_W, CANVAS_H, 14);
  ctx.fillStyle = "#5a3a1b";
  ctx.fill();

  // Cushions (rail surface).
  roundRect(ctx, RAIL - 12, RAIL - 12, PLAY_W + 24, PLAY_H + 24, 8);
  ctx.fillStyle = "#0c5c34";
  ctx.fill();

  // Felt playfield.
  ctx.fillStyle = "#0f7a45";
  ctx.fillRect(ox, oy, PLAY_W, PLAY_H);

  // Subtle felt gradient.
  const g = ctx.createRadialGradient(
    ox + PLAY_W / 2,
    oy + PLAY_H / 2,
    60,
    ox + PLAY_W / 2,
    oy + PLAY_H / 2,
    PLAY_W * 0.7
  );
  g.addColorStop(0, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, PLAY_W, PLAY_H);

  // Head string + spots.
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + PLAY_W * 0.25, oy);
  ctx.lineTo(ox + PLAY_W * 0.25, oy + PLAY_H);
  ctx.stroke();
  dot(ctx, ox + PLAY_W * 0.75, oy + PLAY_H / 2, 2.5, "rgba(255,255,255,0.18)");

  // Pockets.
  for (const p of POCKETS) {
    dot(ctx, ox + p.x, oy + p.y, p.r * 0.8, "#0a0a0a");
  }

  // Aim guide (drawn under balls except the ghost outline).
  if (s.aim) drawAim(ctx, s.aim);

  // Balls.
  for (const b of s.balls) {
    if (b.pocketed) continue;
    drawBall(ctx, b, s);
  }
}

function drawAim(ctx: CanvasRenderingContext2D, aim: NonNullable<AimInfo>) {
  const cx = ox + aim.cueX;
  const cy = oy + aim.cueY;
  const gx = ox + aim.ghostX;
  const gy = oy + aim.ghostY;

  // Forward projection line.
  ctx.save();
  ctx.setLineDash([6, 7]);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(gx, gy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ghost ball at first contact.
  ctx.beginPath();
  ctx.arc(gx, gy, BALL_R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cue stick pulled back behind the ball, opposite the travel direction.
  const back = 26 + aim.power * 150;
  const tipGap = 6 + aim.power * 22;
  const bx = cx - Math.cos(aim.angle) * tipGap;
  const by = cy - Math.sin(aim.angle) * tipGap;
  const ex = cx - Math.cos(aim.angle) * (tipGap + back + 230);
  const ey = cy - Math.sin(aim.angle) * (tipGap + back + 230);
  const grd = ctx.createLinearGradient(bx, by, ex, ey);
  grd.addColorStop(0, "#f4e2b8");
  grd.addColorStop(0.12, "#caa15a");
  grd.addColorStop(1, "#6b4a22");
  ctx.strokeStyle = grd;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball, s: DrawState) {
  const x = ox + b.x;
  const y = oy + b.y;
  const isCue = b.id === 0;
  const stripe = b.id >= 9 && b.id <= 15;
  const base = BALL_COLORS[b.id] ?? "#ffffff";

  // Shadow.
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 2.5, BALL_R, BALL_R * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();

  // Body.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
  ctx.clip();

  if (stripe) {
    ctx.fillStyle = "#f4f4ee";
    ctx.fillRect(x - BALL_R, y - BALL_R, BALL_R * 2, BALL_R * 2);
    ctx.fillStyle = base;
    ctx.fillRect(x - BALL_R, y - BALL_R * 0.5, BALL_R * 2, BALL_R);
  } else {
    ctx.fillStyle = base;
    ctx.fillRect(x - BALL_R, y - BALL_R, BALL_R * 2, BALL_R * 2);
  }

  // Number badge (object balls only).
  if (!isCue) {
    ctx.beginPath();
    ctx.arc(x, y, BALL_R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fbfbf6";
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `bold ${BALL_R * 0.7}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.id), x, y + 0.5);
  }
  ctx.restore();

  // Glossy highlight.
  const hl = ctx.createRadialGradient(
    x - BALL_R * 0.35,
    y - BALL_R * 0.4,
    1,
    x,
    y,
    BALL_R
  );
  hl.addColorStop(0, "rgba(255,255,255,0.55)");
  hl.addColorStop(0.4, "rgba(255,255,255,0.0)");
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();

  // Outline.
  ctx.beginPath();
  ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Ball-in-hand ring on the cue ball.
  if (isCue && s.ballInHand) {
    ctx.beginPath();
    ctx.arc(x, y, BALL_R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = s.placeValid ? "rgba(120,220,140,0.95)" : "rgba(240,90,90,0.95)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
