# ZHOL — Multiplayer Kosovo-Style Gin Rummy

A real-time, no-login, 1v1 multiplayer web app for **Zhol** (Kosovo-style Gin Rummy). Pick a nickname, create or join a room, and play — server-authoritative rules, live sync, reconnection, and a premium neon/glassmorphism table.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript | API routes + frontend in one deployable unit |
| Styling | Tailwind CSS v4 + Framer Motion | Fast to theme, smooth animations |
| Real-time | **Pusher Channels** | Managed pub/sub over HTTPS — works from Vercel serverless functions. A self-hosted `ws` server can't run on Vercel, so this is the "managed real-time service" piece the brief calls for. |
| Shared game state | **Upstash Redis** (REST API) | Vercel functions are stateless/ephemeral; authoritative room & hand state has to live somewhere all invocations can reach over plain `fetch`. |
| History (optional) | PostgreSQL via Prisma | Only used to log finished matches. Gameplay never depends on it — if `DATABASE_URL` is unset, history logging silently no-ops. |
| Hosting | Vercel | Zero-config deploy from GitHub, no Docker/VPS/Nginx |

## How the pieces fit together

1. A player action (draw / discard / gin / ready / start) hits a Next.js **API route**.
2. The route loads the room from **Upstash Redis**, validates the move **server-side** (`lib/room-logic.ts` + `lib/gin-engine.ts` — the client never decides outcomes), mutates it, and saves it back.
3. The route fires a tiny **Pusher** event (`room-updated` / `lobby-updated`) — just a "something changed, go refetch" ping, no game data travels over the socket.
4. Every connected client (including the mover's own browser) refetches `/api/rooms/[code]/state`, which returns a **redacted** view: your own hand in full, the opponent's hand as a card **count** only. This is what makes it cheat-resistant — the opponent's cards never reach your browser.
5. A light polling interval runs alongside Pusher as a safety net (and is the *only* update mechanism if you haven't configured Pusher yet — handy for a first local run).

This "authoritative mutation + push-to-refetch" pattern was chosen deliberately over raw client→client socket messages: it keeps *all* game logic in one server-side module, makes reconnection trivial (a reconnecting client just calls the same `/state` endpoint), and needs nothing that requires a persistent server process.

## Project structure

```
app/
  page.tsx                 nickname entry
  lobby/page.tsx            room list, create/join
  room/[code]/page.tsx      waiting room + full game (same route, status-driven)
  api/
    lobby/                  GET room list + counts
    rooms/                  POST create room
    rooms/[code]/join       POST join / reconnect
    rooms/[code]/ready      POST toggle ready
    rooms/[code]/start      POST start (host only)
    rooms/[code]/move       POST draw/discard/gin (server-authoritative)
    rooms/[code]/leave      POST leave / disconnect
    rooms/[code]/state      GET redacted room+game view, handles reconnect & forfeit
    pusher/auth             POST channel auth (presence channel support)
lib/
  types.ts                  shared domain types
  gin-engine.ts              deck, deal, meld-finding, deadwood minimization, layoffs
  room-logic.ts              room/game orchestration — the server-authoritative rulebook
  store.ts                   Upstash Redis room persistence (+ in-memory dev fallback)
  pusher.ts / use-pusher.ts   realtime server/client helpers
  use-live-data.ts           fetch + realtime-refetch + polling-fallback hook
  client-id.ts                localStorage nickname/device-id (no accounts)
  history.ts                 optional Postgres match logging
components/                  Card, HandFan, OpponentFan, modals, timer, etc.
prisma/schema.prisma         optional MatchHistory model
```

## Game rules implemented (Kosovo house-rule variant)

This is a **Gin-only** variant — there is no knock, no lay-off, no undercut. The only way a round ends is a player fully melding all 10 cards and declaring **Zhol! (Gin)**.

- **Deck**: standard 52 cards + 2 jokers for 2 players. For **3+ players**, two 52-card decks + 2 jokers (106 cards total), auto-selected by room size.
- **Card values**: number cards = face value. **A, J, Q, K all count as 10** (not the usual Ace=1).
- **Melds**: sets (3 or 4 of a kind, any suits) and runs (3+ consecutive cards, same suit). **Ace is low (A-2-3…) or high (…Q-K-A) but never wraps** — K-A-2 is explicitly invalid, exactly as specified.
- **Jokers are wild**: they substitute for any card in a set or run. A hand can win as a plain Gin, or with joker(s) involved.
- **Winning categories & bonus points**:
  | Type | Bonus |
  |---|---|
  | Normal Gin (no joker, mixed suits) | 10 |
  | Joker Gin (joker used, mixed suits) | 20 |
  | Suit Gin (all one suit, no joker) | 25 |
  | Suit + Joker Gin (all one suit, joker used) | 50 |
- **Scoring**: when a round ends, the **winner subtracts** their bonus from their own running score (so it can go negative — no floor). **Every other player still in the round adds their own hand's deadwood value** to their score (no bonus involved for them — just their deadwood). Reach **101 points and you're eliminated**; last player standing wins the match. (101 and the four bonus values are configurable per room — see the room-creation modal.)
- **Multiplayer**: 2–6 players per room. Turn order rotates **clockwise** (ascending seat index) among everyone still in (eliminated players stay visible but are skipped).
- **Dealing**: everyone gets 10 cards; whoever starts the round (rotates each round) is dealt an **11th card** and must immediately discard or declare Gin — no draw on their first turn. The discard pile starts empty and is seeded by that first discard.

### Table UI

- Your hand renders as a held **card fan** (arced, overlapping) and can be **drag-reordered** to sort it however you like — this is a purely local display preference (via Framer Motion's `Reorder`), it never touches game state or round-trips to the server.
- Opponents' hands render the same way but face-down and flipped upside-down, as if you're looking at them from across the table.
- The center pile shows the **stock (vertical/portrait) stacked on top of the discard pile**, with the top discard card rotated **90° (horizontal)** underneath it.
- There is no in-room chat — removed per the brief.


### Assumptions made while translating the rules into code

A couple of details in the brief were open to interpretation — here's exactly what was implemented, so you can adjust `lib/gin-engine.ts` / `lib/room-logic.ts` if your table plays it differently:

- **Unmelded joker deadwood value**: not specified, so an unused joker left in a losing hand counts as **15 points** (`JOKER_DEADWOOD_VALUE` in `lib/gin-engine.ts` — one constant to change).
- **"2 three-of-a-kind and one four-of-a-kind"** was read as *an example* of a valid 10-card meld shape (3+3+4), not the *only* shape — runs count too, consistent with "ace-2-3 same suit" etc. being described right after it.
- **"One card is at the bottom of the pile face up"**: implemented as the standard Gin dealing convention — after dealing 10 cards to each player, the next card off the stock is turned face-up to start the discard pile.
- **Wildcard meld-solving**: the deadwood/Gin-detection search covers every direct set/run use of a joker (completing a set, filling a single gap in a run, or extending a run by one card) — the overwhelming majority of real hands. It does not attempt every exotic multi-gap placement across multiple jokers simultaneously; see the comment above `candidateJokerMelds` in `lib/gin-engine.ts` if you want to extend it further.
- **Elimination vs. one-shot loss**: "counts until 101 then loses" was implemented as *elimination* — a player who crosses 101 is out, and the game continues with whoever's left (natural for 3+ players; for exactly 2 players this is equivalent to "first to 101 loses, other player wins").


## Local development

```bash
npm install
cp .env.example .env.local   # fill in Pusher + Upstash (see below)
npm run dev
```

Open two browser windows (or one normal + one incognito) at `http://localhost:3000` to play both seats.

**You can run the app without Pusher/Upstash configured** for a quick look at the UI — it falls back to an in-memory store and plain polling — but this only works with a single dev server process and will *not* work once deployed to Vercel's multi-instance serverless environment. Set both up before deploying.

### 1. Pusher Channels (real-time)
1. Create a free app at https://dashboard.pusher.com (any cluster).
2. Copy `app_id`, `key`, `secret`, `cluster` into `.env.local`:
   ```
   PUSHER_APP_ID=...
   PUSHER_KEY=...
   PUSHER_SECRET=...
   PUSHER_CLUSTER=eu
   NEXT_PUBLIC_PUSHER_KEY=...        # same value as PUSHER_KEY
   NEXT_PUBLIC_PUSHER_CLUSTER=eu     # same value as PUSHER_CLUSTER
   ```

### 2. Upstash Redis (shared room state)
1. Create a free database at https://upstash.com (or add the **Upstash** integration from the Vercel Marketplace, which wires the env vars for you automatically).
2. Copy the REST URL + token into `.env.local`:
   ```
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

### 3. Postgres (optional, match history only)
Set `DATABASE_URL` to any Postgres connection string (Neon/Supabase/Vercel Postgres all work), then:
```bash
npx prisma db push
```
Leave it unset and everything else works exactly the same — history just isn't recorded.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project → Import** your repo. Framework preset auto-detects Next.js.
3. Add the environment variables from `.env.example` (Pusher + Upstash required, `DATABASE_URL` optional) in **Project Settings → Environment Variables**.
   - Fastest path: install the **Upstash** integration from the Vercel Marketplace on this project — it fills in the two `UPSTASH_REDIS_REST_*` vars for you.
4. Deploy. No build configuration, Dockerfile, or server process required — it's a standard Next.js app on Vercel's serverless runtime.
5. Share the URL. Anyone can open it, type a nickname, and play — no accounts anywhere.

## Notes, limitations & things to harden further

This is a complete, playable implementation of the full brief, but a few areas are worth knowing about if you're taking this further:

- **Redis is a single source of truth with no locking.** Two near-simultaneous moves from the same seat (e.g. a double-click) are unlikely but not impossible to race. For a casual 1v1 card game this is a low-severity edge case; adding an optimistic version/CAS check in `store.ts` would close it fully.
- **Turn timers are visual/informational** — the server doesn't currently auto-discard when a timer expires. Wiring that up is a small addition to `state/route.ts` (check `Date.now() - turnStartedAt` against `rules.turnTimerSeconds` and auto-discard a random card server-side).
- **Room passwords use a simple non-cryptographic hash**, sufficient for "keep casual strangers out of a private room" but not a real auth mechanism — consistent with the "no accounts" scope of this project.
- **Rate limiting / abuse protection** on the API routes isn't included; add it (e.g. Upstash's ratelimit package, which pairs naturally with the Redis you already have) before opening this up publicly at scale.

## License

MIT — do whatever you'd like with it.
