// Engine + deck tests for BTOWN HANGMAN. Plain node, no framework:
//   node scripts/test-engine.mjs
// Exits 0 with a summary line on success, throws on the first failure.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EPOCH, MAX_WRONG, dayNumber, deckPermutation, puzzleIndexForDate,
  puzzleForDate, answerLetters, wrongGuesses, livesLeft, isWon, isLost,
  resultToPoints, pointsToLabel, formatTime, isGuessable,
} from '../js/engine.js';

const deck = JSON.parse(
  await readFile(new URL('../data/deck.json', import.meta.url), 'utf8'),
);

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

// ------------------------------------------------------------ deck integrity
ok(`deck has a healthy size (${deck.length} entries)`, () => {
  assert.ok(deck.length >= 120, `only ${deck.length} entries`);
});

ok('every entry has answer / hint / whyLocal strings', () => {
  for (const [i, e] of deck.entries()) {
    assert.equal(typeof e.answer, 'string', `entry ${i} answer`);
    assert.equal(typeof e.hint, 'string', `entry ${i} (${e.answer}) hint`);
    assert.equal(typeof e.whyLocal, 'string', `entry ${i} (${e.answer}) whyLocal`);
    assert.ok(e.answer.length > 0 && e.hint.length > 0 && e.whyLocal.length > 0,
      `entry ${i} (${e.answer}) has an empty field`);
  }
});

ok('answers use only A–Z, space, hyphen, apostrophe (ALL CAPS)', () => {
  for (const e of deck) {
    assert.match(e.answer, /^[A-Z' -]+$/, e.answer);
    assert.ok(!/^[ '-]|[ '-]$/.test(e.answer), `${e.answer}: leading/trailing separator`);
  }
});

ok('after normalization every answer is 4–18 guessable letters', () => {
  for (const e of deck) {
    const letters = answerLetters(e.answer);
    assert.match(letters, /^[A-Z]+$/, e.answer);
    assert.ok(letters.length >= 4, `${e.answer}: only ${letters.length} letters`);
    assert.ok(letters.length <= 18, `${e.answer}: ${letters.length} letters`);
  }
});

ok('no duplicate answers', () => {
  const seen = new Set();
  for (const e of deck) {
    assert.ok(!seen.has(e.answer), `duplicate: ${e.answer}`);
    seen.add(e.answer);
  }
});

// ------------------------------------------------------------ daily pick
ok('day #1 lands on the epoch', () => {
  assert.equal(dayNumber(EPOCH), 1);
  assert.equal(dayNumber('2026-08-29'), 2);
});

ok('the daily pick is deterministic', () => {
  const a = puzzleForDate('2026-08-28', deck);
  const b = puzzleForDate('2026-08-28', deck);
  assert.equal(a, b);
  assert.ok(deck.includes(a));
});

ok('the permutation itself is deterministic and complete', () => {
  const p1 = deckPermutation(deck.length);
  const p2 = deckPermutation(deck.length);
  assert.deepEqual(p1, p2);
  assert.deepEqual([...p1].sort((x, y) => x - y),
    Array.from({ length: deck.length }, (_, i) => i));
});

ok('one full cycle never repeats an answer, then wraps', () => {
  const seen = new Set();
  const day = (i) => new Date(Date.parse(EPOCH + 'T12:00:00Z') + i * 86400000)
    .toISOString().slice(0, 10);
  for (let i = 0; i < deck.length; i++) {
    const idx = puzzleIndexForDate(day(i), deck.length);
    assert.ok(!seen.has(idx), `${day(i)} repeats index ${idx}`);
    seen.add(idx);
  }
  assert.equal(seen.size, deck.length);
  // day deck.length+1 wraps to day 1's puzzle
  assert.equal(puzzleIndexForDate(day(deck.length), deck.length),
    puzzleIndexForDate(day(0), deck.length));
});

ok('pre-epoch test dates still resolve to a valid index', () => {
  const idx = puzzleIndexForDate('2026-08-01', deck.length);
  assert.ok(Number.isInteger(idx) && idx >= 0 && idx < deck.length);
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

// ------------------------------------------------------------ scoring
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

console.log(`\nAll ${n} checks passed — deck of ${deck.length}, epoch ${EPOCH}.`);
