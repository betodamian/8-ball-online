// Table geometry, ball definitions, and rack setup.
// All coordinates are in an abstract "logical" space; the renderer scales it.
// The long axis is X (length), the short axis is Y (width). Ratio 2:1.

export const BALL_R = 11;
export const PLAY_W = 880; // length (x)
export const PLAY_H = 440; // width (y)

// Pocket centers: 4 corners + 2 side pockets.
export const POCKETS: { x: number; y: number; r: number }[] = [
  { x: 0, y: 0, r: 22 },
  { x: PLAY_W / 2, y: 0, r: 20 },
  { x: PLAY_W, y: 0, r: 22 },
  { x: 0, y: PLAY_H, r: 22 },
  { x: PLAY_W / 2, y: PLAY_H, r: 20 },
  { x: PLAY_W, y: PLAY_H, r: 22 },
];

// How wide the "mouth" of a pocket is along a rail. Within this distance of a
// pocket (measured along the rail) the cushion is open so balls fall in
// instead of bouncing.
export const POCKET_MOUTH = 26;

// Cue ball starts on the head spot (1/4 down the long axis, centered).
export const HEAD_SPOT = { x: PLAY_W * 0.25, y: PLAY_H / 2 };
// Foot spot is where the apex of the rack sits (3/4 down).
export const FOOT_SPOT = { x: PLAY_W * 0.75, y: PLAY_H / 2 };

export type Ball = {
  id: number; // 0 = cue, 1-7 solids, 8 = eight ball, 9-15 stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
};

export type Group = "solids" | "stripes" | null;

export function ballGroup(id: number): Group {
  if (id >= 1 && id <= 7) return "solids";
  if (id >= 9 && id <= 15) return "stripes";
  return null; // cue (0) and eight (8)
}

// Visual color for each ball id.
export const BALL_COLORS: Record<number, string> = {
  0: "#f7f7f2", // cue
  1: "#f2c200", // yellow
  2: "#1f5fd6", // blue
  3: "#d62828", // red
  4: "#6a0dad", // purple
  5: "#e36414", // orange
  6: "#2a9d4a", // green
  7: "#7c2d12", // maroon
  8: "#1a1a1a", // black
  9: "#f2c200",
  10: "#1f5fd6",
  11: "#d62828",
  12: "#6a0dad",
  13: "#e36414",
  14: "#2a9d4a",
  15: "#7c2d12",
};

// Build a fresh rack. Cue ball on the head spot, 15 object balls racked in a
// triangle with the 8-ball in the center. Returns balls in id order.
export function makeRack(): Ball[] {
  const balls: Ball[] = [];
  // Cue ball
  balls.push({ id: 0, x: HEAD_SPOT.x, y: HEAD_SPOT.y, vx: 0, vy: 0, pocketed: false });

  // Triangle rows growing away from the cue (toward +x).
  const dx = BALL_R * 2 * Math.cos(Math.PI / 6); // row spacing
  const gap = 0.5; // tiny gap so balls don't start overlapping
  const dy = BALL_R * 2 + gap; // spacing within a row

  // A valid 8-ball rack: apex = 1, 8-ball dead center, back corners a
  // solid and a stripe. Indexed [row][col].
  const layout: number[][] = [
    [1],
    [9, 11],
    [3, 8, 12],
    [13, 5, 2, 14],
    [7, 15, 4, 10, 6],
  ];

  for (let row = 0; row < layout.length; row++) {
    const rowBalls = layout[row];
    const x = FOOT_SPOT.x + row * dx;
    for (let col = 0; col < rowBalls.length; col++) {
      const y = FOOT_SPOT.y + (col - row / 2) * dy;
      balls.push({ id: rowBalls[col], x, y, vx: 0, vy: 0, pocketed: false });
    }
  }

  balls.sort((a, b) => a.id - b.id);
  return balls;
}

// Is a point a legal spot to place the cue ball (ball-in-hand)?
// Must be inside the playfield and not overlapping another ball.
export function isLegalCuePlacement(
  x: number,
  y: number,
  balls: Ball[]
): boolean {
  if (x < BALL_R || x > PLAY_W - BALL_R) return false;
  if (y < BALL_R || y > PLAY_H - BALL_R) return false;
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < (BALL_R * 2) * (BALL_R * 2)) return false;
  }
  return true;
}
