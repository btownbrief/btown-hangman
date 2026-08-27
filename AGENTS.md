# Btown Hangman — agent instructions

Shared brain for any AI agent working in this repo (Codex, Claude Code, etc.).
Read `README.md` first for how the game works — this file only adds the rules an
agent needs so it doesn't break something. Stephen is non-technical — explain
consequential changes in plain language.

## What this is
Btown's daily Burlington hangman. Plain static site, **no build step**:
`index.html` + `style.css` + ES modules in `js/`. Deployed by GitHub Pages via
`.github/workflows/deploy.yml` on push to the default branch.

## Rules that will trip you up
- **`js/engine.js` is pure and deterministic** — no DOM, no `Date.now()`; the
  date arrives as a string and the deck is passed in. The daily pick is a fixed
  seeded permutation of deck indexes (seed `btown-hangman:deck:v1`) walked by
  day number — change the seed, the shuffle, or the deck **length** and every
  player's daily history reshuffles. If you touch engine.js, update
  `scripts/test-engine.mjs` in the same change and run it
  (`node scripts/test-engine.mjs`).
- **`data/deck.json` editing rules:** answers ALL CAPS, only `A–Z`, space,
  hyphen, apostrophe; 4–18 letters after stripping separators; no duplicate
  answers; every entry needs `answer` + `hint` + `whyLocal`. Hints must not
  give the answer away; `whyLocal` must be true (keep it general — no invented
  facts). The test script enforces the mechanical rules — run it after any
  deck edit.
- The leaderboard uses the **shared Btown Games Supabase backend**
  (`js/leaderboard.js`, game slug `btown-hangman`). Scores are submitted
  **only on a win** as `livesLeft × 10000 + max(0, 6000 − deciseconds)` —
  lives dominate, speed breaks ties; never submit raw times or losses. UI rows
  decode via `engine.pointsToLabel`. The public anon key can only call
  security-definer RPCs; never put a service-role key or secret in client JS.
- `?testdate=YYYY-MM-DD` must never write saves, stats, streaks, or
  leaderboard scores — preserve every `TEST_DATE` guard.

## Before you finish
Run `node scripts/test-engine.mjs` if you touched `js/engine.js` or
`data/deck.json`. For UI changes, load the page at a phone-sized viewport and
play a few guesses — the keyboard/slot/figure feel is the whole game. Say what
you verified.
