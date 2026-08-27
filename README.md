# Btown Hangman

The daily Burlington hangman gauntlet — a
[Btown Games](https://play.btownbrief.com) production from the
[BTown Brief](https://www.btownbrief.com).

**Play: https://play.btownbrief.com/btown-hangman/**

Every day is a **three-word run on one gallows** with **six lives shared
across the whole thing**:

1. **Around Town** — a Burlington word or phrase (creemees, Church
   Street, stick season, Champ, the works), hint shown.
2. **From the Brief** — a name from the BTown Brief's world: the
   businesses, venues, and fixtures the newsletter covers, hint shown.
3. **The Stinger** — a short, nasty general word (rare letters, few
   vowels). Its hint stays **locked until your third total miss** of the
   run.

Guess one letter at a time on the on-screen (or physical) keyboard. Wrong
letters — on any word — draw one more piece of the little chalk figure;
six misses anywhere and the day is lost. The keyboard resets for each new
word; the gallows and the clock don't. Solved words collapse into ✓ chips
above the board. Spaces, hyphens, and apostrophes are pre-revealed. The
end screen recaps all three answers with their "why it's local" blurbs.
Streaks, stats, an emoji share, and the shared monthly leaderboard
included. Mid-run progress saves locally, and the clock only runs while
you're looking at the page.

Plain static site — no build step, no frameworks. `index.html` + `style.css`
+ ES modules in `js/`. Deployed by GitHub Pages via
`.github/workflows/deploy.yml` on push.

## The daily pick

`js/engine.js` turns the date string (America/New_York) into three
puzzles, the same for every player:

1. Three decks: `data/deck.json` (word 1, answer / hint / whyLocal),
   `data/brief-deck.json` (word 2, same schema), and
   `data/stinger-deck.json` (word 3, answer / hint only).
2. Each deck gets its **own fixed** seeded shuffle of its indexes
   (seeds `btown-hangman:deck:v1` / `:brief:v1` / `:stinger:v1`,
   xmur3 → mulberry32) defining that deck's play order. Deck 1 kept the
   original launch seed, so its schedule never reshuffled.
3. Day N (epoch `2026-08-28` = day #1) plays permutation slot
   `(N − 1) mod deck length` in each deck — no answer repeats until its
   whole deck has run, then it cycles.

No server involved; same date in → same three puzzles out on every
device. **Changing a deck's length** reshuffles that deck's whole walk
(the permutation length changes) — that's fine, but do it knowingly.

## Deck editing rules

- **Which deck gets what:** Burlington/Vermont places, seasons, and
  general local life → `deck.json`. Named businesses, venues,
  institutions, and BTown Brief fixtures (sections, games, apps) →
  `brief-deck.json`. Short hard general English words (5–8 letters,
  single word, no proper nouns) → `stinger-deck.json`.
- **No answer may appear in more than one deck** — the test enforces it
  across all three.
- deck/brief answers: ALL CAPS, only `A–Z`, space, hyphen, apostrophe;
  4–18 letters after stripping separators; `answer` + `hint` + `whyLocal`
  all required and true (no invented facts).
- stinger answers: single word, 5–8 letters `A–Z`; `answer` + `hint`.
  Keep hints short — players only see them after their 3rd miss.

## Scoring

Submitted to the shared monthly leaderboard **only on a win** (all three
words solved) — the formula is unchanged from the one-word game:

```
livesLeft × 10000 + max(0, 6000 − deciseconds elapsed)
```

`livesLeft` is the lives remaining after word 3; the clock starts on the
first guess and runs across the whole run. Lives dominate; speed breaks
ties. Max is still 66000. In-game rows decode back to friendly text
("❤️×5 · 1:43").

## Testing

```
node scripts/test-engine.mjs
```

Play any date with `?testdate=YYYY-MM-DD` — test dates never touch saves,
stats, streaks, or the leaderboard.
