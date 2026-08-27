# Btown Hangman — agent instructions

Shared brain for any AI agent working in this repo (Codex, Claude Code, etc.).
Read `README.md` first for how the game works — this file only adds the rules an
agent needs so it doesn't break something. Stephen is non-technical — explain
consequential changes in plain language.

## What this is
Btown's daily Burlington hangman — **one run = three words on one gallows,
six lives shared across the whole run**: word 1 "Around Town"
(`data/deck.json`), word 2 "From the Brief" (`data/brief-deck.json`), word 3
"The Stinger" (`data/stinger-deck.json`, a short hard general word whose hint
stays locked until the run's 3rd total miss). The keyboard resets per word;
the gallows and the clock don't. Plain static site, **no build step**:
`index.html` + `style.css` + ES modules in `js/`. Deployed by GitHub Pages via
`.github/workflows/deploy.yml` on push to the default branch.

## Rules that will trip you up
- **`js/engine.js` is pure and deterministic** — no DOM, no `Date.now()`; the
  date arrives as a string and the decks are passed in. Each deck's daily pick
  is a fixed seeded permutation of its indexes walked by day number (seeds in
  `DECK_SEEDS`: `btown-hangman:deck:v1` / `:brief:v1` / `:stinger:v1` — deck 1
  keeps the launch seed) — change a seed, the shuffle, or a deck **length**
  and that deck's daily history reshuffles. If you touch engine.js, update
  `scripts/test-engine.mjs` in the same change and run it
  (`node scripts/test-engine.mjs`).
- **Deck editing rules:** which deck gets what — Burlington/Vermont places,
  seasons, and general local life → `deck.json`; named businesses, venues,
  institutions, and Brief fixtures (sections, games, apps) →
  `brief-deck.json`; short hard general English words → `stinger-deck.json`.
  **An answer may live in exactly ONE deck** — the test enforces no
  duplicates across all three. deck/brief: answers ALL CAPS, only `A–Z`,
  space, hyphen, apostrophe; 4–18 letters after stripping separators; every
  entry needs `answer` + `hint` + `whyLocal` (true, general — no invented
  facts). stinger: single word, 5–8 letters `A–Z` only, no proper nouns,
  `answer` + `hint` (hint short — it's shown only after the 3rd miss). Run
  the test script after any deck edit.
- The leaderboard uses the **shared Btown Games Supabase backend**
  (`js/leaderboard.js`, game slug `btown-hangman`). Scores are submitted
  **only on a win** (all three words solved) as
  `livesLeft × 10000 + max(0, 6000 − deciseconds)` — livesLeft is what's
  left after word 3; lives dominate, speed breaks ties; never submit raw
  times or losses. This formula predates the three-word run and must not
  change. UI rows decode via `engine.pointsToLabel`. The public anon key can
  only call security-definer RPCs; never put a service-role key or secret in
  client JS.
- `?testdate=YYYY-MM-DD` must never write saves, stats, streaks, or
  leaderboard scores — preserve every `TEST_DATE` guard.
- Local state uses the `bh-` prefix; the run state key is `bh-state-v2`
  (v1 single-word saves are deliberately ignored, no migration).

## Before you finish
Run `node scripts/test-engine.mjs` if you touched `js/engine.js` or
any deck. For UI changes, load the page at a phone-sized viewport and
play a few guesses — the keyboard/slot/figure feel is the whole game. Say what
you verified.
