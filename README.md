# Btown Hangman

The daily Burlington hangman — a
[Btown Games](https://play.btownbrief.com) production from the
[BTown Brief](https://www.btownbrief.com).

**Play: https://play.btownbrief.com/btown-hangman/**

Everyone gets the same **Burlington word or phrase** each day — creemees,
Church Street, stick season, Champ, the works. Guess it one letter at a
time on the on-screen (or physical) keyboard. Wrong letters cost one of
**six lives** and draw one more piece of the little chalk figure; solve it
before he hangs. Spaces, hyphens, and apostrophes are pre-revealed. Each
puzzle carries a short category hint, and the end screen explains **why
it's local**. Streaks, stats, an emoji share, and the shared monthly
leaderboard included. Mid-game progress saves locally, and the clock only
runs while you're looking at the page.

Plain static site — no build step, no frameworks. `index.html` + `style.css`
+ ES modules in `js/`. Deployed by GitHub Pages via
`.github/workflows/deploy.yml` on push.

## The daily pick

`js/engine.js` turns the date string (America/New_York) into a puzzle, the
same for every player:

1. `data/deck.json` holds the whole deck (answer / hint / whyLocal).
2. One **fixed** seeded shuffle of the deck's indexes (seed
   `btown-hangman:deck:v1`, xmur3 → mulberry32) defines the play order.
3. Day N (epoch `2026-08-28` = day #1) plays permutation slot
   `(N − 1) mod deck length` — so no answer repeats until the whole deck
   has run, then it cycles.

No server involved; same date in → same puzzle out on every device.
**Appending** new entries to the deck reshuffles the whole walk (the
permutation length changes) — that's fine, but do it knowingly.

## Scoring

Submitted to the shared monthly leaderboard **only on a win**:

```
livesLeft × 10000 + max(0, 6000 − deciseconds elapsed)
```

Lives dominate; speed breaks ties. The clock starts on the first guess.
In-game rows decode back to friendly text ("❤️×5 · 1:43").

## Testing

```
node scripts/test-engine.mjs
```

Play any date with `?testdate=YYYY-MM-DD` — test dates never touch saves,
stats, streaks, or the leaderboard.
