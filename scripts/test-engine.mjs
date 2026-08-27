// Engine + deck tests for BTOWN HANGMAN. Plain node, no framework:
//   node scripts/test-engine.mjs
// Exits 0 with a summary line on success, throws on the first failure.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EPOCH, MAX_WRONG, RUN_WORDS, HINT_LOCK_MISSES, DECK_SEEDS,
  dayNumber, deckPermutation, puzzleIndexForDate, puzzleForDate,
  puzzlesForDate, answerLetters, wrongGuesses, livesLeft, isWon, isLost,
  runWrongTotal, runLivesLeft, runIsWon, runIsLost,
  resultToPoints, pointsToLabel, formatTime, isGuessable,
} from '../js/engine.js';

const load = async (name) => JSON.parse(
  await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'),
);
const deck = await load('deck.json');
const brief = await load('brief-deck.json');
const stinger = await load('stinger-deck.json');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

// ------------------------------------------------------------ deck integrity
ok(`decks have healthy sizes (${deck.length} / ${brief.length} / ${stinger.length})`, () => {
  assert.ok(deck.length >= 120, `deck: only ${deck.length}`);
  assert.ok(brief.length >= 80, `brief: only ${brief.length}`);
  assert.ok(stinger.length >= 120, `stinger: only ${stinger.length}`);
});

ok('deck + brief entries have answer / hint / whyLocal strings', () => {
  for (const [name, d] of [['deck', deck], ['brief', brief]]) {
    for (const [i, e] of d.entries()) {
      assert.equal(typeof e.answer, 'string', `${name} ${i} answer`);
      assert.equal(typeof e.hint, 'string', `${name} ${i} (${e.answer}) hint`);
      assert.equal(typeof e.whyLocal, 'string', `${name} ${i} (${e.answer}) whyLocal`);
      assert.ok(e.answer.length > 0 && e.hint.length > 0 && e.whyLocal.length > 0,
        `${name} ${i} (${e.answer}) has an empty field`);
    }
  }
});

ok('stinger entries have answer / hint strings (whyLocal not required)', () => {
  for (const [i, e] of stinger.entries()) {
    assert.equal(typeof e.answer, 'string', `stinger ${i} answer`);
    assert.equal(typeof e.hint, 'string', `stinger ${i} (${e.answer}) hint`);
    assert.ok(e.answer.length > 0 && e.hint.length > 0,
      `stinger ${i} (${e.answer}) has an empty field`);
  }
});

ok('deck + brief answers use only A–Z, space, hyphen, apostrophe (ALL CAPS)', () => {
  for (const e of [...deck, ...brief]) {
    assert.match(e.answer, /^[A-Z' -]+$/, e.answer);
    assert.ok(!/^[ '-]|[ '-]$/.test(e.answer), `${e.answer}: leading/trailing separator`);
  }
});

ok('after normalization every deck/brief answer is 4–18 guessable letters', () => {
  for (const e of [...deck, ...brief]) {
    const letters = answerLetters(e.answer);
    assert.match(letters, /^[A-Z]+$/, e.answer);
    assert.ok(letters.length >= 4, `${e.answer}: only ${letters.length} letters`);
    assert.ok(letters.length <= 18, `${e.answer}: ${letters.length} letters`);
  }
});

ok('stinger answers are single words, 5–8 letters, A–Z only', () => {
  for (const e of stinger) {
    assert.match(e.answer, /^[A-Z]{5,8}$/, e.answer);
  }
});

ok('no duplicate answers within any deck', () => {
  for (const [name, d] of [['deck', deck], ['brief', brief], ['stinger', stinger]]) {
    const seen = new Set();
    for (const e of d) {
      assert.ok(!seen.has(e.answer), `${name} duplicate: ${e.answer}`);
      seen.add(e.answer);
    }
  }
});

ok('no answer appears in more than one deck (deck / brief / stinger)', () => {
  const seen = new Map();
  for (const [name, d] of [['deck', deck], ['brief', brief], ['stinger', stinger]]) {
    for (const e of d) {
      assert.ok(!seen.has(e.answer),
        `${e.answer} is in both ${seen.get(e.answer)} and ${name}`);
      seen.set(e.answer, name);
    }
  }
});

// ------------------------------------------------------------ daily pick
ok('day #1 lands on the epoch', () => {
  assert.equal(dayNumber(EPOCH), 1);
  assert.equal(dayNumber('2026-08-29'), 2);
});

ok('deck 1 kept its launch seed — day #1 word 1 is still BIKE PATH', () => {
  assert.equal(DECK_SEEDS.deck, 'btown-hangman:deck:v1');
  assert.equal(puzzleForDate(EPOCH, deck, DECK_SEEDS.deck).answer, 'BIKE PATH');
});

ok('the daily three-word pick is deterministic', () => {
  const decks = { deck, brief, stinger };
  const a = puzzlesForDate('2026-08-28', decks);
  const b = puzzlesForDate('2026-08-28', decks);
  assert.equal(a.length, RUN_WORDS);
  assert.deepEqual(a, b);
  assert.ok(deck.includes(a[0]) && brief.includes(a[1]) && stinger.includes(a[2]));
});

ok('each deck seed produces a deterministic, complete permutation', () => {
  for (const [d, seed] of [[deck, DECK_SEEDS.deck], [brief, DECK_SEEDS.brief],
    [stinger, DECK_SEEDS.stinger]]) {
    const p1 = deckPermutation(d.length, seed);
    const p2 = deckPermutation(d.length, seed);
    assert.deepEqual(p1, p2);
    assert.deepEqual([...p1].sort((x, y) => x - y),
      Array.from({ length: d.length }, (_, i) => i));
  }
});

ok('the three deck seeds differ and give different walks', () => {
  assert.equal(new Set(Object.values(DECK_SEEDS)).size, 3);
  const len = Math.min(deck.length, brief.length, stinger.length);
  const walks = Object.values(DECK_SEEDS).map((s) => deckPermutation(len, s).join(','));
  assert.equal(new Set(walks).size, 3, 'two seeds produced the same shuffle');
});

ok('one full cycle of each deck never repeats an answer, then wraps', () => {
  const day = (i) => new Date(Date.parse(EPOCH + 'T12:00:00Z') + i * 86400000)
    .toISOString().slice(0, 10);
  for (const [name, d, seed] of [['deck', deck, DECK_SEEDS.deck],
    ['brief', brief, DECK_SEEDS.brief], ['stinger', stinger, DECK_SEEDS.stinger]]) {
    const seen = new Set();
    for (let i = 0; i < d.length; i++) {
      const idx = puzzleIndexForDate(day(i), d.length, seed);
      assert.ok(!seen.has(idx), `${name}: ${day(i)} repeats index ${idx}`);
      seen.add(idx);
    }
    assert.equal(seen.size, d.length);
    // day len+1 wraps to day 1's puzzle
    assert.equal(puzzleIndexForDate(day(d.length), d.length, seed),
      puzzleIndexForDate(day(0), d.length, seed));
  }
});

ok('pre-epoch test dates still resolve to a valid three-word run', () => {
  const run = puzzlesForDate('2026-08-01', { deck, brief, stinger });
  assert.equal(run.length, RUN_WORDS);
  run.forEach((p) => assert.equal(typeof p.answer, 'string'));
});

// ------------------------------------------------------------ hangman rules
ok('separators are pre-revealed, letters are guessable', () => {
  assert.ok(isGuessable('A') && isGuessable('Z'));
  assert.ok(!isGuessable(' ') && !isGuessable('-') && !isGuessable("'"));
  assert.equal(answerLetters("AL'S FRENCH FRYS"), 'ALSFRENCHFRYS');
});

ok('win / loss / lives arithmetic', () => {
  const a = 'MUD SEASON';
  assert.ok(!isWon(a, ['M', 'U', 'D']));
  assert.ok(isWon(a, ['M', 'U', 'D', 'S', 'E', 'A', 'O', 'N']));
  assert.deepEqual(wrongGuesses(a, ['M', 'X', 'Z']), ['X', 'Z']);
  assert.equal(livesLeft(a, ['X', 'Z']), MAX_WRONG - 2);
  assert.ok(!isLost(a, ['X', 'Z']));
  assert.ok(isLost(a, ['X', 'Z', 'Q', 'J', 'K', 'V']));
  assert.equal(livesLeft(a, ['X', 'Z', 'Q', 'J', 'K', 'V']), 0);
});

// ------------------------------------------------------------ the three-word run
ok('run simulation: solve 3 words with misses spread across them', () => {
  const answers = ['MUD SEASON', 'QUICK HITS', 'BANJO'];
  const solve = (a) => [...new Set(answerLetters(a))];
  // clean sweep: no misses anywhere → 6 lives left, won
  let g = [solve(answers[0]), solve(answers[1]), solve(answers[2])];
  assert.equal(runWrongTotal(answers, g), 0);
  assert.equal(runLivesLeft(answers, g), MAX_WRONG);
  assert.ok(runIsWon(answers, g) && !runIsLost(answers, g));
  // 2 misses on word 1, 1 on word 2, 2 on word 3 → 5 total, 1 life left
  g = [
    ['X', 'Z', ...solve(answers[0])],
    ['Q', 'U', 'I', 'C', 'K', 'H', 'T', 'S', 'W'],  // W misses
    ['F', 'V', ...solve(answers[2])],
  ];
  assert.equal(runWrongTotal(answers, g), 5);
  assert.equal(runLivesLeft(answers, g), 1);
  assert.ok(runIsWon(answers, g));
  // shared lives: 6 misses spread across words = the run is lost,
  // even though no single word took 6 misses on its own
  g = [['X', 'Z', ...solve(answers[0])], ['J', 'V', ...solve(answers[1])], ['P', 'W']];
  assert.equal(runWrongTotal(answers, g), 6);
  assert.equal(runLivesLeft(answers, g), 0);
  assert.ok(runIsLost(answers, g) && !runIsWon(answers, g));
  // unattempted words count zero wrong (mid-run states are valid)
  assert.equal(runWrongTotal(answers, [['X'], [], []]), 1);
  // all words solved but out of lives is still a loss, not a win
  g = [
    ['X', 'Z', 'Q', ...solve(answers[0])],
    ['J', 'V', 'W', ...solve(answers[1])],
    solve(answers[2]),
  ];
  assert.ok(runIsLost(answers, g) && !runIsWon(answers, g));
});

ok('run constants: 3 words, hint lock at 3 misses', () => {
  assert.equal(RUN_WORDS, 3);
  assert.equal(HINT_LOCK_MISSES, 3);
});

// ------------------------------------------------------------ scoring (UNCHANGED)
ok('lives dominate, speed breaks ties', () => {
  // a perfect slow win still beats a fast 5-life win
  assert.ok(resultToPoints(6, 599_000) > resultToPoints(5, 0));
  // equal lives: faster wins
  assert.ok(resultToPoints(4, 30_000) > resultToPoints(4, 31_000));
  // spot values
  assert.equal(resultToPoints(6, 0), 66000);
  assert.equal(resultToPoints(5, 103_000), 5 * 10000 + (6000 - 1030));
  assert.equal(resultToPoints(1, 600_000), 10000);  // bonus floors at 0
  assert.equal(resultToPoints(1, 3_600_000), 10000);
});

ok('pointsToLabel decodes lives and time', () => {
  assert.equal(pointsToLabel(resultToPoints(5, 103_000)), '❤️×5 · 1:43');
  assert.equal(pointsToLabel(resultToPoints(6, 0)), '❤️×6 · 0:00');
  assert.equal(pointsToLabel(resultToPoints(2, 700_000)), '❤️×2 · 10:00+');
});

ok('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(61_500), '1:01');
});

console.log(`\nAll ${n} checks passed — decks ${deck.length}/${brief.length}/${stinger.length}, epoch ${EPOCH}.`);
