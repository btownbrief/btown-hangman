// BTOWN HANGMAN — UI layer only. All game rules live in js/engine.js
// (pure, tested by scripts/test-engine.mjs); this file owns the DOM:
// the keyboard, letter slots, the stroke-drawn figure, timer, stats,
// share, and the monthly leaderboard.
//
// One daily run = THREE words on one shared gallows: word 1 "Around
// Town" (data/deck.json), word 2 "From the Brief" (data/brief-deck.json),
// word 3 "The Stinger" (data/stinger-deck.json). Six lives total across
// the whole run; the keyboard resets for each new word, the clock and the
// chalk guy don't.

import {
  MAX_WRONG, RUN_WORDS, HINT_LOCK_MISSES, dayNumber, puzzlesForDate,
  answerLetters, wrongGuesses, runWrongTotal, runLivesLeft, isWon, isLost,
  isGuessable, resultToPoints, pointsToLabel, formatTime,
} from './engine.js';
import {
  lbEnabled, getName, submitScore, renamePlayer, fetchTop, monthLabel, playerId,
} from './leaderboard.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ date (America/New_York)
const NY = 'America/New_York';
function nyDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // YYYY-MM-DD
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
function msToNextNyMidnight() {
  const today = nyDateStr();
  let lo = Date.now(), hi = Date.now() + 26 * 3600000;
  while (hi - lo > 500) {
    const mid = (lo + hi) / 2;
    if (nyDateStr(new Date(mid)) === today) lo = mid; else hi = mid;
  }
  return hi - Date.now();
}

// ?testdate=YYYY-MM-DD plays another day's puzzle (testing only; skips
// state/stats/leaderboard writes so real progress is never touched)
const TEST_DATE = new URLSearchParams(location.search).get('testdate');
const TODAY = TEST_DATE || nyDateStr();
const DAY_NUM = dayNumber(TODAY);

const STAGE_NAMES = ['Around Town', 'From the Brief', 'The Stinger'];

// ------------------------------------------------------------ state
let puzzles = null;         // [{answer,hint,whyLocal}, {…}, {answer,hint}] for TODAY
let wordIdx = 0;            // which word of the run is in play (0..2)
let guessedPerWord = [[], [], []]; // letters guessed, per word, in order
let status = 'playing';     // playing | won | lost
let started = false;        // first guess made — clock running
let elapsedMs = 0;
let endMs = 0;              // frozen clock at game end
let lastTick = 0;
let lastDateCheck = 0;
let dayRolledOver = false;
let transitioning = false;  // word-to-word hand-off animation in flight

const answers = () => puzzles.map((p) => p.answer);
const guessedNow = () => guessedPerWord[wordIdx];
const totalWrong = () => (puzzles ? runWrongTotal(answers(), guessedPerWord) : 0);
const lives = () => (puzzles ? runLivesLeft(answers(), guessedPerWord) : MAX_WRONG);
const hintUnlocked = () => totalWrong() >= HINT_LOCK_MISSES;

// ------------------------------------------------------------ boot
async function boot() {
  $('dayBar').textContent = `#${DAY_NUM} · ${MAX_WRONG} lives · three words`;
  buildKeyboard();
  await loadDecks();
}

async function loadDecks() {
  $('deckErrorOverlay').classList.add('hidden');
  try {
    const [deck, brief, stinger] = await Promise.all(
      ['data/deck.json', 'data/brief-deck.json', 'data/stinger-deck.json']
        .map(async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Deck request failed: ${res.status}`);
          return res.json();
        }),
    );
    puzzles = puzzlesForDate(TODAY, { deck, brief, stinger });
    restore();
    renderAll();
    if (status !== 'playing') setTimeout(() => showResults(false), 400);
    void retryPendingSubmit();
  } catch {
    puzzles = null;
    $('deckErrorOverlay').classList.remove('hidden');
  }
}
$('deckRetryBtn').addEventListener('click', () => { void loadDecks(); });

// ------------------------------------------------------------ persistence
// v2: the three-word run. Old single-word 'bh-state' saves are ignored
// on purpose (no migration — the schema changed the night before day 1).
const STATE_KEY = 'bh-state-v2';
function save() {
  if (TEST_DATE) return;
  localStorage.setItem(STATE_KEY, JSON.stringify({
    date: TODAY, wordIdx, guessedPerWord, status, started, elapsedMs, endMs,
  }));
}
function restore() {
  let st = null;
  if (!TEST_DATE) {
    try { st = JSON.parse(localStorage.getItem(STATE_KEY)); } catch { /* corrupt */ }
  }
  if (!st || st.date !== TODAY) {
    if (!TEST_DATE && !localStorage.getItem('bh-seen-help')) {
      localStorage.setItem('bh-seen-help', '1');
      $('helpOverlay').classList.remove('hidden');
    }
    return;
  }
  // Trust the save only if it's a plausible per-word letter list for today.
  const lists = Array.isArray(st.guessedPerWord) ? st.guessedPerWord : [];
  const clean = Array.from({ length: RUN_WORDS }, (_, i) => {
    const g = Array.isArray(lists[i]) ? lists[i].filter((ch) => isGuessable(ch)) : [];
    return [...new Set(g)];
  });
  const idx = Number.isInteger(st.wordIdx) && st.wordIdx >= 0 && st.wordIdx < RUN_WORDS
    ? st.wordIdx : 0;
  // every word before the current one must actually be solved
  for (let i = 0; i < idx; i++) {
    if (!isWon(puzzles[i].answer, clean[i])) return;
  }
  guessedPerWord = clean;
  wordIdx = idx;
  started = Boolean(st.started);
  elapsedMs = Number.isFinite(st.elapsedMs) ? st.elapsedMs : 0;
  endMs = Number.isFinite(st.endMs) ? st.endMs : 0;
  const wrong = totalWrong();
  if (wrong < MAX_WRONG) {
    // a save can land between solving a word and the hand-off animation
    while (wordIdx < RUN_WORDS - 1 && isWon(puzzles[wordIdx].answer, guessedNow())) wordIdx++;
  }
  status = wrong >= MAX_WRONG ? 'lost'
    : wordIdx === RUN_WORDS - 1 && isWon(puzzles[wordIdx].answer, guessedNow()) ? 'won'
    : 'playing';
}

// ------------------------------------------------------------ timer
setInterval(() => {
  const now = Date.now();
  if (!TEST_DATE && now - lastDateCheck >= 1000) {
    lastDateCheck = now;
    if (nyDateStr(new Date(now)) !== TODAY) showDayRollover();
  }
  if (dayRolledOver) return;
  if (status !== 'playing' || !started) return;
  if (document.visibilityState === 'visible' && lastTick) {
    // cap the step so a throttled background tab can't dump hidden time
    // into the clock — the timer only counts while you're looking at it
    elapsedMs += Math.min(now - lastTick, 400);
  }
  lastTick = now;
  renderTimer();
  if (Math.floor(elapsedMs / 3000) !== Math.floor((elapsedMs - 200) / 3000)) save();
}, 100);
document.addEventListener('visibilitychange', () => { lastTick = Date.now(); });

function showDayRollover() {
  if (dayRolledOver) return;
  dayRolledOver = true;
  save();
  lastTick = 0;
  $('dayOverlay').classList.remove('hidden');
}

function renderTimer() {
  $('timer').textContent = formatTime(status === 'playing' ? elapsedMs : endMs);
}

// ------------------------------------------------------------ rendering
function renderAll() {
  renderChips();
  renderStage();
  renderHint();
  renderSlots();
  renderKeyboard();
  renderFigure(true);
  renderLives();
  renderTimer();
}

// solved words collapse into small ✓ chips above the board
function renderChips() {
  const box = $('chips');
  box.innerHTML = '';
  for (let i = 0; i < wordIdx; i++) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `✓ ${puzzles[i].answer}`;
    box.appendChild(chip);
  }
  box.classList.toggle('hidden', wordIdx === 0);
}

function renderStage() {
  $('stage').textContent =
    `Word ${wordIdx + 1} of ${RUN_WORDS} — ${STAGE_NAMES[wordIdx]}`;
}

function renderHint() {
  const box = $('hint');
  box.innerHTML = '';
  const locked = wordIdx === RUN_WORDS - 1 && !hintUnlocked();
  box.classList.toggle('locked', locked);
  if (locked) {
    box.textContent = `🔒 Hint locked — costs ${HINT_LOCK_MISSES} misses`;
    return;
  }
  const b = document.createElement('b');
  b.textContent = 'Hint: ';
  box.append(b, puzzles[wordIdx].hint);
}

function renderSlots(dealIn = false) {
  const box = $('slots');
  box.innerHTML = '';
  const g = new Set(guessedNow());
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let k = 0;
  for (const wordStr of puzzles[wordIdx].answer.split(' ')) {
    const word = document.createElement('div');
    word.className = 'word';
    for (const ch of wordStr) {
      const slot = document.createElement('div');
      const span = document.createElement('span');
      if (!isGuessable(ch)) {
        slot.className = 'slot pre';
        span.textContent = ch;
      } else if (g.has(ch)) {
        slot.className = 'slot filled';
        span.textContent = ch;
      } else if (status === 'lost') {
        slot.className = 'slot missed';
        span.textContent = ch;
      } else {
        slot.className = 'slot';
        span.textContent = ch;         // hidden by the un-flipped transform
        span.setAttribute('aria-hidden', 'true');
      }
      if (dealIn && !reduced) {
        slot.classList.add('deal');
        slot.style.animationDelay = `${k * 40}ms`;
        k++;
      }
      slot.appendChild(span);
      word.appendChild(slot);
    }
    box.appendChild(word);
  }
}

const KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
function buildKeyboard() {
  const kb = $('kb');
  kb.innerHTML = '';
  for (const row of KB_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    for (const ch of row) {
      const key = document.createElement('button');
      key.className = 'key';
      key.textContent = ch;
      key.dataset.ch = ch;
      key.addEventListener('click', () => guess(ch));
      rowEl.appendChild(key);
    }
    kb.appendChild(rowEl);
  }
}

// per-word keyboard: all letters come back for each new word
function renderKeyboard() {
  const inAnswer = new Set(answerLetters(puzzles[wordIdx].answer));
  const g = guessedNow();
  for (const key of $('kb').querySelectorAll('.key')) {
    const ch = key.dataset.ch;
    const used = g.includes(ch);
    key.classList.toggle('hit', used && inAnswer.has(ch));
    key.classList.toggle('miss', used && !inAnswer.has(ch));
    key.disabled = used || status !== 'playing' || transitioning;
  }
}

function renderFigure(instant = false) {
  const wrong = totalWrong();
  for (const part of document.querySelectorAll('#figure .part')) {
    const on = Number(part.dataset.part) < wrong;
    if (instant) {
      // restoring a saved game: show the parts without replaying the draw-in
      part.classList.remove('on');
      part.style.strokeDashoffset = on ? '0' : '';
      part.dataset.shown = on ? '1' : '';
    } else if (on && part.dataset.shown !== '1') {
      part.classList.add('on');
      part.dataset.shown = '1';
    }
  }
  document.querySelector('.figure-panel').classList.toggle('doomed', status === 'lost');
}

function renderLives() {
  $('lives').textContent = '❤️'.repeat(lives()) + '🖤'.repeat(MAX_WRONG - lives());
}

// ------------------------------------------------------------ guessing
function guess(ch) {
  if (status !== 'playing' || dayRolledOver || !puzzles || transitioning) return;
  if (guessedNow().includes(ch)) return;
  if (!started) { started = true; lastTick = Date.now(); }
  guessedNow().push(ch);
  const word = puzzles[wordIdx].answer;
  const hit = answerLetters(word).includes(ch);
  const keyEl = $('kb').querySelector(`.key[data-ch="${ch}"]`);
  if (hit) {
    keyEl?.classList.add('bounce');
    setTimeout(() => keyEl?.classList.remove('bounce'), 300);
    renderSlots();
  } else {
    const board = $('board');
    board.classList.remove('shake');
    void board.offsetWidth;
    board.classList.add('shake');
    renderFigure();
    renderHint();   // the 3rd total miss unlocks the Stinger hint
  }
  renderKeyboard();
  renderLives();

  if (runWrongTotal(answers(), guessedPerWord) >= MAX_WRONG) {
    status = 'lost';
    endMs = elapsedMs;
    renderTimer();
    recordStats();
    save();
    renderSlots();        // reveal the current word in chalk-red
    renderKeyboard();
    renderFigure();
    setTimeout(() => showResults(true), 1400);
  } else if (isWon(word, guessedNow())) {
    if (wordIdx === RUN_WORDS - 1) {
      status = 'won';
      endMs = elapsedMs;
      renderTimer();
      recordStats();
      save();
      celebrate();
      setTimeout(() => showResults(true), 1700);
    } else {
      advanceWord();
    }
  } else {
    save();
  }
}

// word solved → gold glow, collapse into a chip, deal in the next word
function advanceWord() {
  transitioning = true;
  save();                // the solved word is safe even if the tab dies mid-hand-off
  renderKeyboard();      // freeze the keys during the hand-off
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slots = [...$('slots').querySelectorAll('.slot:not(.pre)')];
  slots.forEach((slot, i) => {
    if (reduced) slot.classList.add('win');
    else setTimeout(() => slot.classList.add('win'), i * 45);
  });
  const wait = reduced ? 250 : 900;
  setTimeout(() => {
    wordIdx++;
    transitioning = false;
    save();
    renderChips();
    renderStage();
    renderHint();
    renderSlots(true);   // new slots deal in
    renderKeyboard();    // fresh keyboard for the new word
  }, wait);
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement) return;
  const ch = e.key.toUpperCase();
  if (/^[A-Z]$/.test(ch)) guess(ch);
});

// The tasteful win moment: each slot glows gold in sequence, then SAVED!
function celebrate() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slots = [...$('slots').querySelectorAll('.slot:not(.pre)')];
  slots.forEach((slot, i) => {
    if (reduced) slot.classList.add('win');
    else setTimeout(() => slot.classList.add('win'), i * 55);
  });
  const banner = $('saved');
  banner.classList.remove('hidden');
  banner.classList.add('show');
  setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('show');
  }, 1600);
}

// ------------------------------------------------------------ stats + streak
// dist[i] counts wins that kept (MAX_WRONG − i) lives — i.e. i total
// misses across the whole run. Same semantics as before: lives left on wins.
const STATS_KEY = 'bh-stats';
function loadStats() {
  const blank = { played: 0, wins: 0, cur: 0, max: 0, lastPlay: '', lastWin: '',
    dist: [0, 0, 0, 0, 0, 0] };
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    if (!s || !Array.isArray(s.dist) || s.dist.length !== MAX_WRONG) return blank;
    return { ...blank, ...s };
  } catch {
    return blank;
  }
}
function recordStats() {
  if (TEST_DATE) return;
  const s = loadStats();
  if (s.lastPlay === TODAY) return; // guard double-count
  s.played++;
  if (status === 'won') {
    s.wins++;
    s.dist[totalWrong()]++;
    s.cur = (s.lastWin && daysBetween(s.lastWin, TODAY) === 1) ? s.cur + 1 : 1;
    s.max = Math.max(s.max, s.cur);
    s.lastWin = TODAY;
  } else {
    s.cur = 0;
  }
  s.lastPlay = TODAY;
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}
function renderStats() {
  const s = loadStats();
  $('stPlayed').textContent = s.played;
  $('stWinPct').textContent = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  $('stCur').textContent = s.cur;
  $('stMax').textContent = s.max;
  const dist = $('dist');
  dist.innerHTML = '';
  const maxD = Math.max(1, ...s.dist);
  s.dist.forEach((n, i) => {
    const row = document.createElement('div');
    row.className = 'dist-row';
    const hl = status === 'won' && !TEST_DATE && totalWrong() === i && s.lastPlay === TODAY;
    row.innerHTML = `<span class="n">❤️×${MAX_WRONG - i}</span><span class="bar${hl ? ' hl' : ''}"></span>`;
    const bar = row.querySelector('.bar');
    bar.style.width = `${Math.max(10, (n / maxD) * 100)}%`;
    bar.textContent = n;
    dist.appendChild(row);
  });
}

// ------------------------------------------------------------ results modal
let countdownTimer;
function showResults(fresh) {
  renderStats();
  if (status !== 'playing') {
    $('resultCard').classList.remove('hidden');
    const n = lives();
    $('resultHead').textContent = status === 'won'
      ? `Ran the gauntlet — ${n} ${n === 1 ? 'life' : 'lives'} left! 🪢`
      : 'Out of rope 💀';
    $('resultSub').textContent = status === 'won'
      ? `Solved ${RUN_WORDS}/${RUN_WORDS} in ${formatTime(endMs)}`
      : `Fell at word ${wordIdx + 1}/${RUN_WORDS} — it was ${puzzles[wordIdx].answer} · fresh rope at midnight`;
    renderRecap();
    $('finishedRow').classList.remove('hidden');
    clearInterval(countdownTimer);
    const tick = () => {
      const ms = msToNextNyMidnight();
      const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
      $('countdown').textContent =
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  $('statsOverlay').classList.remove('hidden');
  void retryPendingSubmit();
  updateLeaderboard(fresh);
}

// the day's three answers, each with its whyLocal (or the Stinger's hint)
function renderRecap() {
  const box = $('recapList');
  box.innerHTML = '';
  puzzles.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'recap-row';
    const head = document.createElement('div');
    head.className = 'recap-answer';
    head.textContent = p.answer;
    const tag = document.createElement('span');
    tag.className = 'recap-tag';
    tag.textContent = STAGE_NAMES[i];
    head.appendChild(tag);
    const text = document.createElement('p');
    text.textContent = p.whyLocal || p.hint;
    row.append(head, text);
    box.appendChild(row);
  });
}

// ------------------------------------------------------------ share
$('shareBtn').addEventListener('click', async () => {
  const n = lives();
  const hearts = '❤️'.repeat(n) + '🖤'.repeat(MAX_WRONG - n);
  const head = status === 'won'
    ? `Btown Hangman #${DAY_NUM} — ran the gauntlet with ${n} ${n === 1 ? 'life' : 'lives'} left`
    : `Btown Hangman #${DAY_NUM} — the gallows got me at word ${wordIdx + 1}`;
  const streak = loadStats().cur;
  const text = `${head}\n${hearts}\n` +
    (status === 'won' && streak >= 2 ? `🔥 ${streak} days running\n` : '') +
    '\nhttps://play.btownbrief.com/btown-hangman/';
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  } catch { /* user cancelled */ }
});

let toastTimer;
function toast(msg, ms = 1400) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// ------------------------------------------------------------ modals
$('helpBtn').addEventListener('click', () => $('helpOverlay').classList.remove('hidden'));
$('statsBtn').addEventListener('click', () => showResults(false));
document.querySelectorAll('.overlay').forEach((ov) => {
  ov.addEventListener('click', (e) => {
    if (e.target === ov && ov.dataset.static === undefined) ov.classList.add('hidden');
  });
  ov.querySelector('[data-close]')?.addEventListener('click', () => ov.classList.add('hidden'));
});
$('reloadBtn').addEventListener('click', () => location.reload());

// ------------------------------------------------------------ leaderboard (monthly cleanest saves)
// The shared backend keeps each player's highest score per month. Submitted
// only on a WIN (all three words solved): livesLeft × 10000 +
// max(0, 6000 − deciseconds) — lives dominate, speed breaks ties
// (engine.resultToPoints, unchanged from the one-word game). Rows decode
// back to "❤️×5 · 1:43" via engine.pointsToLabel.
const lbBox = $('lb'), lbList = $('lbList'), lbStatus = $('lbStatus');
const lbForm = $('lbForm'), lbNameInput = $('lbNameInput');
const lbThisBtn = $('lbThisBtn'), lbLastBtn = $('lbLastBtn'), lbRenameBtn = $('lbRenameBtn');
let lbMonthOffset = 0;

if (lbEnabled()) {
  lbBox.classList.remove('hidden');
  lbThisBtn.textContent = monthLabel(0);
  lbLastBtn.textContent = monthLabel(-1);
}

const SUBMIT_KEY = 'bh-lb-submitted';
const PENDING_SUBMIT_KEY = 'bh-pending-submit';
let pendingRetry = null;

function storePendingSubmit(points) {
  localStorage.setItem(PENDING_SUBMIT_KEY, JSON.stringify({ date: TODAY, points }));
}

function readPendingSubmit() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_SUBMIT_KEY));
    if (!pending || typeof pending.date !== 'string' || !Number.isFinite(pending.points)) {
      localStorage.removeItem(PENDING_SUBMIT_KEY);
      return null;
    }
    return pending;
  } catch {
    localStorage.removeItem(PENDING_SUBMIT_KEY);
    return null;
  }
}

async function submitForCurrentPage(points) {
  if (nyDateStr() !== TODAY) {
    showDayRollover();
    return false;
  }
  await submitScore(points);
  return true;
}

function retryPendingSubmit() {
  if (pendingRetry) return pendingRetry;
  pendingRetry = (async () => {
    const pending = readPendingSubmit();
    if (!pending) return;
    const currentDate = nyDateStr();
    if (pending.date.slice(0, 7) !== currentDate.slice(0, 7)) {
      localStorage.removeItem(PENDING_SUBMIT_KEY);
      return;
    }
    if (TEST_DATE || !lbEnabled() || !getName() || currentDate !== TODAY) {
      if (!TEST_DATE && currentDate !== TODAY) showDayRollover();
      return;
    }
    try {
      if (await submitForCurrentPage(pending.points)) {
        localStorage.setItem(SUBMIT_KEY, pending.date);
        localStorage.removeItem(PENDING_SUBMIT_KEY);
      }
    } catch { /* stay queued until the next retry trigger */ }
  })().finally(() => { pendingRetry = null; });
  return pendingRetry;
}

async function updateLeaderboard(fresh) {
  if (!lbEnabled()) return;
  const points = status === 'won' ? resultToPoints(lives(), endMs) : 0;
  const shouldSubmit = !TEST_DATE && fresh && status === 'won' && points > 0 &&
    localStorage.getItem(SUBMIT_KEY) !== TODAY;
  if (shouldSubmit && !getName()) {
    lbForm.classList.remove('hidden');
    lbRenameBtn.classList.add('hidden');
    lbStatus.textContent = 'Pick a name to join the monthly leaderboard!';
    lbList.innerHTML = '';
    lbForm.dataset.pendingScore = String(points);
    return;
  }
  if (shouldSubmit) {
    try {
      if (await submitForCurrentPage(points)) localStorage.setItem(SUBMIT_KEY, TODAY);
    } catch {
      storePendingSubmit(points);
    }
  }
  renderBoard();
}

async function renderBoard() {
  lbForm.classList.add('hidden');
  lbRenameBtn.classList.remove('hidden');
  lbStatus.textContent = 'Loading…';
  try {
    const rows = await fetchTop(lbMonthOffset);
    const me = playerId();
    lbList.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.player_id === me) li.className = 'me';
      const medal = ['🥇', '🥈', '🥉'][i];
      li.innerHTML = `<span class="rank">${medal || i + 1}</span><span class="nm"></span><span class="sc"></span>`;
      li.querySelector('.nm').textContent = r.name;
      li.querySelector('.sc').textContent = pointsToLabel(r.score);
      lbList.appendChild(li);
    });
    const myRank = rows.findIndex((r) => r.player_id === me);
    lbStatus.textContent = rows.length === 0
      ? 'No saves yet this month — be the first!'
      : myRank >= 0 ? `You're #${myRank + 1} of ${rows.length} this month` : '';
  } catch {
    lbStatus.textContent = 'Leaderboard unavailable (offline?)';
  }
}

$('lbSaveBtn').addEventListener('click', async () => {
  const name = lbNameInput.value.trim();
  if (!name) { lbNameInput.focus(); return; }
  const pending = Number(lbForm.dataset.pendingScore || 0);
  lbForm.dataset.pendingScore = '';
  try {
    await renamePlayer(name);
    if (pending > 0) {
      if (await submitForCurrentPage(pending)) localStorage.setItem(SUBMIT_KEY, TODAY);
    }
  } catch {
    if (pending > 0) storePendingSubmit(pending);
  }
  renderBoard();
});
lbNameInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') $('lbSaveBtn').click();
});
lbRenameBtn.addEventListener('click', () => {
  lbNameInput.value = getName();
  lbForm.classList.remove('hidden');
  lbRenameBtn.classList.add('hidden');
  lbNameInput.focus();
});
lbThisBtn.addEventListener('click', () => {
  lbMonthOffset = 0;
  lbThisBtn.classList.add('sel');
  lbLastBtn.classList.remove('sel');
  renderBoard();
});
lbLastBtn.addEventListener('click', () => {
  lbMonthOffset = -1;
  lbLastBtn.classList.add('sel');
  lbThisBtn.classList.remove('sel');
  renderBoard();
});

window.addEventListener('online', () => { void retryPendingSubmit(); });

boot();
