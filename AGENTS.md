# Btown Hangman — agent instructions

Read `README.md` first. Stephen is non-technical; explain consequential changes
in plain language.

## Current rules

One daily run is three **general English words** on one gallows with six shared
lives: The Opener (`data/deck.json`), The Twist (`data/brief-deck.json`), and
The Stinger (`data/stinger-deck.json`). The old local-only deck guidance was
superseded by Stephen's request to remove predictable Vermont answers.

All clues start hidden. A player can buy one clue per word for one shared life,
but cannot spend the last life on a clue. Keyboard resets per word; lives and
timer carry over. No automatic clue unlocks or category giveaways.

Keep the interface minimal: no automatic help popup, category names, explanatory
board copy, ticker, or promotional blocks. Help stays behind the question mark.

## Invariants

- `js/engine.js` must remain pure and deterministic: no DOM or `Date.now()`.
  Update and run `scripts/test-engine.mjs` with any engine/deck change.
- Each deck walks a fixed seeded permutation (`:v3` seeds in `DECK_SEEDS`).
  Changing a seed or deck length reshuffles history; do it deliberately.
- Every answer belongs to exactly one deck. Answers are uppercase A–Z single
  words, with a nonempty `hint`. Opener: 5–11 letters; Twist: 4–7; Stinger: 5–8.
  Favor familiar words with interesting spelling over obscure dictionary traps.
- `runWrongTotal` counts wrong letters only. `runLivesSpent` includes purchased
  clues. Use the latter for the figure, loss checks, and stats distribution;
  `runLivesLeft` includes clue costs when given `hintsRevealed`.
- Shared leaderboard game slug is `btown-hangman`. Submit wins only, with the
  unchanged formula `livesLeft * 10000 + max(0, 6000 - deciseconds)`.
  Never put service-role keys or secrets in client code.
- `?testdate=YYYY-MM-DD` must never write saves, stats, streaks, player identity,
  pending submissions, or leaderboard scores. Preserve the test-date guards.
- Current run key is `bh-state-v3`; preserve older keys and lifetime `bh-stats`.
  Do not import v2 guesses into the new decks. Persist purchased clues and
  restore their life cost. Stats and submissions still count once per date.

## Before finishing

Run `node scripts/test-engine.mjs` for engine/deck edits. For UI changes, load a
phone-sized viewport and play guesses, a paid clue, and a word transition.
Check the longest word at 320px width, restored clue cost, and test-date isolation.
Report what was verified. Deployment is GitHub Pages on push to `main`.
