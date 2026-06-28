# 🎱 8-Ball Pool: Private Online Lobbies

A two-player online 8-ball pool game. Create a **private lobby**, share the
**4-character join code**, and play with a friend in the browser. Built with
Next.js and deployed on Vercel. Syncing is done by polling a small key/value
store (Upstash Redis via the Vercel Marketplace).

There is also a **Pass & Play** mode for two people on one screen, with no
account or backend needed.

## ▶️ Live demo

**https://8-ball-online.vercel.app**

> Pass & Play works out of the box. Online lobbies need the Upstash Redis store
> connected on Vercel (see "Enable online play" below). Without it, the in-memory
> fallback cannot share lobby state across Vercel's serverless instances.

## Features

- Private lobbies with shareable join codes and shareable links
- Deterministic billiards physics so both players see the exact same shot
- Full 8-ball rules: break, open table, solids/stripes assignment, fouls,
  ball-in-hand, scratch handling, 8-on-the-break re-rack, and win/lose on the 8
- Aim by dragging back from the cue ball (slingshot), with a power meter and an
  aim guide. Works with mouse and touch.
- Rematch button. Lobbies auto-expire after 6 hours.
- Local Pass & Play mode

---

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Locally you do **not** need any account. If no Upstash credentials are set, the
app uses an in-memory store. That is enough to:

- Play **Pass & Play** (`/local`)
- Test **online lobbies in a single dev process** (open two tabs: create in one,
  join in the other)

> The in-memory store only lives inside one server process, so it is for local
> dev only. Production needs Upstash (below), otherwise serverless functions on
> different instances will not share lobby state.

---

## Enable online play (Upstash on Vercel)

The project is already deployed. To make **online lobbies** work across two
devices, connect a Redis store:

1. In the Vercel project, open the **Storage** tab and **Create Database**, then
   choose **Upstash for Redis** (there is a free tier).
2. Connect it to this project. Vercel automatically injects the environment
   variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, and friends) into all
   environments.
3. **Redeploy** so the new env vars are picked up (Deployments, then the three
   dots menu, then Redeploy).

The app reads either `KV_REST_API_URL` / `KV_REST_API_TOKEN` **or**
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, so whichever names your
integration sets will work. See [.env.example](.env.example).

### Deploying your own copy

Either run `vercel --prod` from this folder, or import the repo in Vercel (the
framework preset is auto-detected as Next.js), then do the Upstash step above.

---

## How to play

1. Enter your name, then click **Create lobby**.
2. Share the **join code** (or the **Copy link** button) with a friend.
3. They open the site, choose **Join with a code**, and enter it (or open your
   shared link).
4. Player 1 breaks. **Drag back from the cue ball and release** to shoot. Pull
   farther for more power. After a foul, the other player gets **ball in hand**
   (drag the white ball to reposition it first).

### Rules summary

- The table is **open** until someone legally pockets a ball off the break. The
  group of the first ball pocketed becomes that player's (solids or stripes).
- Pocket one of **your** balls with no foul, and you shoot again. Otherwise the
  turn passes.
- **Fouls** (scratch, no ball hit, wrong ball hit first) give the opponent
  **ball in hand**.
- Clear all of your group balls, then legally pocket the **8-ball** to win.
- Pocket the 8 early, or scratch while sinking it, and you **lose**. The 8 on
  the break re-racks.

---

## Project layout

```
app/
  page.tsx                 Home: create / join / pass & play
  local/page.tsx           Pass & Play (local 2-player)
  play/[code]/page.tsx     Online room (renders components/Room)
  api/lobby/...            Create, join, state, shot, and rematch endpoints
components/
  PoolGame.tsx             Canvas, input, animation, HUD (shared by online + local)
  Room.tsx                 Online room: polling, shot sync, rematch, sharing
  draw.ts                  Pure canvas rendering of the table and balls
lib/
  engine.ts                Deterministic physics and aim prediction
  game.ts                  Game state and 8-ball rules resolution
  table.ts                 Table geometry, ball colors, rack setup
  store.ts                 Upstash Redis with in-memory fallback
  client.ts                Browser API and identity helpers
  api.ts / ids.ts          Server helpers and code/id generation
```

## Notes and limitations

- Sync is **turn-based polling** (about every 0.85s), which suits a turn-based
  game. It is not a low-latency continuous stream, so you see your opponent's
  shot a moment after they take it.
- The shooting client computes the authoritative result. The server validates
  whose turn it is but trusts the gameplay result. This is fine for a friendly
  private game (no anti-cheat).
