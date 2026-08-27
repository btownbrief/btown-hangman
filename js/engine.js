// BTOWN HANGMAN — pure game logic. No DOM, no Date.now(): the current
// date arrives as a 'YYYY-MM-DD' string and everything here is a plain
// function over JSON-serializable values. The deck itself lives in
// data/deck.json and is passed in. Tested by scripts/test-engine.mjs.

// ------------------------------------------------------------ seeded RNG
// xmur3 string hash → mulberry32 PRNG (same pair the fleet uses). Same
// seed string in, same sequence out, on every device.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ day number
// #1 = launch day; used for the share text, wordle-style.
export const EPOCH = '2026-08-28';

// Integer day on the proleptic Gregorian calendar. The constant offset is
// irrelevant because dayNumber only subtracts two civil dates.
function civilDay(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new RangeError(`Invalid date: ${dateStr}`);
  let year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return era * 146097 + yearOfEra * 365 + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100) + dayOfYear;
}

export function dayNumber(dateStr, epoch = EPOCH) {
  return civilDay(dateStr) - civilDay(epoch) + 1;
}

// ------------------------------------------------------------ daily pick
// A deterministic no-repeat walk over each deck: one fixed seeded shuffle
// of the deck's indexes (seed below, NOT the date), then day (N−1) mod
// deck-length indexes into that permutation. Every player gets the same
// three puzzles each day, and no answer repeats until its deck has run.
// Deck 1 keeps the original launch seed so its schedule never reshuffled;
// the two decks added for the three-word run get their own seeds.
const DECK_SEED = 'btown-hangman:deck:v1';
export const DECK_SEEDS = {
  deck: DECK_SEED,                       // word 1 — Around Town
  brief: 'btown-hangman:brief:v1',       // word 2 — From the Brief
  stinger: 'btown-hangman:stinger:v1',   // word 3 — The Stinger
};

export function deckPermutation(len, seed = DECK_SEED) {
  const rand = mulberry32(xmur3(seed)());
  const idx = Array.from({ length: len }, (_, i) => i);
  for (let i = len - 1; i > 0; i--) {                 // Fisher–Yates
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function puzzleIndexForDate(dateStr, deckLen, seed = DECK_SEED) {
  const n = dayNumber(dateStr);
  const pos = ((n - 1) % deckLen + deckLen) % deckLen; // safe for pre-epoch testdates
  return deckPermutation(deckLen, seed)[pos];
}

export function puzzleForDate(dateStr, deck, seed = DECK_SEED) {
  return deck[puzzleIndexForDate(dateStr, deck.length, seed)];
}

// The day's full run: [word 1, word 2, word 3] for
// decks = { deck, brief, stinger } (each an array of entries).
export function puzzlesForDate(dateStr, decks) {
  return [
    puzzleForDate(dateStr, decks.deck, DECK_SEEDS.deck),
    puzzleForDate(dateStr, decks.brief, DECK_SEEDS.brief),
    puzzleForDate(dateStr, decks.stinger, DECK_SEEDS.stinger),
  ];
}

// ------------------------------------------------------------ hangman rules
export const MAX_WRONG = 6;

// Answers are ALL CAPS; spaces / hyphens / apostrophes are pre-revealed
// and never guessable — only A–Z counts.
export const isGuessable = (ch) => /^[A-Z]$/.test(ch);

// Just the guessable letters of an answer (what the player must find).
export function answerLetters(answer) {
  return answer.replace(/[^A-Z]/g, '');
}

// Letters guessed that are NOT in the answer (the body count).
export function wrongGuesses(answer, guessed) {
  const inAnswer = new Set(answerLetters(answer));
  return guessed.filter((ch) => !inAnswer.has(ch));
}

export function livesLeft(answer, guessed) {
  return Math.max(0, MAX_WRONG - wrongGuesses(answer, guessed).length);
}

export function isWon(answer, guessed) {
  const g = new Set(guessed);
  return [...new Set(answerLetters(answer))].every((ch) => g.has(ch));
}

export function isLost(answer, guessed) {
  return wrongGuesses(answer, guessed).length >= MAX_WRONG;
}

// ------------------------------------------------------------ the three-word run
// One daily run = three words with ONE shared pool of six lives. Each
// word gets its own guessed-letter list (the keyboard resets per word),
// but every miss anywhere in the run draws the same chalk guy.
export const RUN_WORDS = 3;

// Word 3's hint stays locked until the run's 3rd total miss.
export const HINT_LOCK_MISSES = 3;

// answers: array of answer strings; guessedLists: parallel array of
// guessed-letter arrays (one per word attempted so far).
export function runWrongTotal(answers, guessedLists) {
  return answers.reduce((sum, answer, i) =>
    sum + wrongGuesses(answer, guessedLists[i] || []).length, 0);
}

export function runLivesLeft(answers, guessedLists) {
  return Math.max(0, MAX_WRONG - runWrongTotal(answers, guessedLists));
}

export function runIsLost(answers, guessedLists) {
  return runWrongTotal(answers, guessedLists) >= MAX_WRONG;
}

export function runIsWon(answers, guessedLists) {
  return !runIsLost(answers, guessedLists) &&
    answers.every((answer, i) => isWon(answer, guessedLists[i] || []));
}

// ------------------------------------------------------------ leaderboard score
// The shared Btown backend ranks higher-is-better and keeps each player's
// best score per month. Submitted only on a WIN:
//   livesLeft × 10000  +  max(0, 6000 − deciseconds elapsed)
// Lives dominate (each life is worth more than any speed bonus); speed
// breaks ties among equal-life wins. The clock starts on the first guess;
// a solve slower than 10 minutes just scores its lives.
export function resultToPoints(lives, elapsedMs) {
  return lives * 10000 + Math.max(0, 6000 - Math.floor(elapsedMs / 100));
}

// Decode a submitted score back into friendly text, e.g. "❤️×5 · 1:43".
export function pointsToLabel(points) {
  const lives = Math.floor(points / 10000);
  const bonus = points % 10000;
  const time = bonus > 0 ? formatTime((6000 - bonus) * 100) : '10:00+';
  return `❤️×${lives} · ${time}`;
}

export function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
