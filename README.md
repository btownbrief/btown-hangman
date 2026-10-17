# Btown Hangman

A daily three-word challenge from [Btown Games](https://play.btownbrief.com).

**Play: https://play.btownbrief.com/btown-hangman/**

Solve three general English words with **six lives shared across the run**:

1. **The Opener** — a longer word with more letters to work with.
2. **The Twist** — a shorter word with fewer footholds.
3. **The Stinger** — unusual letters, repeated letters, or tricky spelling.

There are no local categories or starting clues. Every word offers an optional
**clue for one life**. A clue can be bought once per word, never with your last
life. Wrong guesses and purchased clues draw the same six-part figure. The
keyboard resets each word; spent lives and the clock carry over. The timer
starts on the first guess or clue and runs while the page is visible.

All three words must be solved to win. Results show the answers and definitions,
plus lifetime stats, streaks, sharing, and the existing monthly leaderboard.

## Files and daily selection

Plain static site: `index.html`, `style.css`, and ES modules in `js/`; no build.
GitHub Pages deploys on a push to `main` via `.github/workflows/deploy.yml`.

The historical filenames remain, but all three decks now contain general words:

- `data/deck.json`: 120 Openers, 5–11 letters.
- `data/brief-deck.json`: 80 Twists, 4–7 letters.
- `data/stinger-deck.json`: 184 Stingers, 5–8 letters.

Entries have `answer` (uppercase A–Z, single word) and a short `hint`.
No answer may occur in more than one deck. Favor recognizable words and fair
clues; avoid proper nouns and specialist vocabulary that requires a dictionary.

`js/engine.js` is pure and deterministic. It uses a fixed seeded permutation
for each deck, walked by day number in America/New_York. Same date means the
same three words on every device; a deck does not repeat until its full cycle
has run. Epoch `2026-08-28` still supplies the public day number.

The general-word edition deliberately uses new `:v3` seeds and new deck contents,
so historical date previews also use the new word schedules. Changing a deck's
length or seed changes that schedule.

## Saves and scoring

`bh-state-v3` stores per-word guesses and purchased clues. The prior local-word
run (`bh-state-v2`) is retained but not loaded because its answers have changed.
Existing `bh-stats`, streaks, player identity, and leaderboard records remain.
Play starts immediately. The question-mark button opens three short instructions;
there is no automatic introduction. Statistics and the leaderboard are collapsed
on the result screen.
If someone already completed the old game today, lifetime stats and score
submission still count at most once for that date.

Winning scores keep the established formula:

```
livesLeft × 10000 + max(0, 6000 − deciseconds elapsed)
```

Purchased clues reduce `livesLeft` just like misses. Lives dominate speed; losses
are never submitted. Existing monthly scores from the easier edition remain.

## Validation

```
node scripts/test-engine.mjs
```

Tests cover deck integrity, deterministic no-repeat cycles, shared lives,
clue costs, last-life protection, win/loss rules, and the existing score formula.

`?testdate=YYYY-MM-DD` previews a date without writing saves, stats, streaks,
player identity, or leaderboard scores. Check the UI on a narrow phone, including
a purchased clue, a word transition, a loss, and a restored paid clue.
