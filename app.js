// Daily Spend — semester envelope tracker, printed as a receipt.
// Three envelopes over one ledger: discretionary (weekly rollover),
// groceries (monthly stipend; leftovers roll into a savings jar at cycle close),
// set-aside purchases.

(function () {
  'use strict';

  const STORAGE_KEY = 'dailySpend_v2';
  const GROUND_KEY = 'dailySpend_ground';
  const LEGACY_KEY = 'dailySpend_budget';
  const LEGACY_BACKUP = 'dailySpend_v1_backup';

  const CAT_OUT = 'out';
  const CAT_FOOD = 'food';
  const CAT_PLAN = 'plan';
  const CAT_SAVE = 'save'; // drawn from grocery savings

  const GROUNDS = {
    paper: '#E6DFCF',
    carbon: '#14150F'
  };

  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let state = null;

  // ============================================
  // Dates
  // ============================================

  function parseLocalDate(s) {
    return new Date(s + 'T00:00:00');
  }

  function fmtYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function weekdayLong(s) {
    return WD_LONG[(parseLocalDate(s).getDay() + 6) % 7];
  }

  function composeYMD(year, month, day) {
    const last = daysInMonth(year, month);
    const d = Math.min(Math.max(1, day), last);
    return fmtYMD(new Date(year, month, d));
  }

  function addDays(s, n) {
    const d = parseLocalDate(s);
    d.setDate(d.getDate() + n);
    return fmtYMD(d);
  }

  function addMonths(s, n) {
    const d = parseLocalDate(s);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return fmtYMD(d);
  }

  function getToday() {
    return fmtYMD(new Date());
  }

  function diffDays(a, b) {
    return Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
  }

  function mondayOf(s) {
    const dow = parseLocalDate(s).getDay(); // 0 Sun … 6 Sat
    return addDays(s, -((dow + 6) % 7));
  }

  function clampDate(s, lo, hi) {
    if (diffDays(lo, s) < 0) return lo;
    if (diffDays(s, hi) < 0) return hi;
    return s;
  }

  // ============================================
  // Persistence
  // ============================================

  function blankState() {
    return {
      v: 2,
      startDate: getToday(),
      endDate: '',
      pool: 0,
      outName: 'Going out',
      stipend: 0,
      stipendDay: 1,
      opening: null,
      planned: [],
      tx: [],
      recapSeen: null
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        state = JSON.parse(raw);
        if (state && state.v === 2 && state.endDate) return true;
      } catch (e) {
        console.error('Could not read saved budget:', e);
      }
    }
    // Preserve any v1 data rather than dropping it, then start clean.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !localStorage.getItem(LEGACY_BACKUP)) {
      localStorage.setItem(LEGACY_BACKUP, legacy);
    }
    state = null;
    return false;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  // ============================================
  // Derived model
  // ============================================

  function txOn(date, cat) {
    return state.tx.filter(t => t.date === date && (!cat || t.cat === cat));
  }

  function sumTx(list) {
    return list.reduce((s, t) => s + t.amount, 0);
  }

  function spentOn(date, cat) {
    return sumTx(txOn(date, cat));
  }

  // Grocery cycle containing `date`, anchored on stipendDay and clamped to startDate.
  function cycleStartFor(date) {
    const d = parseLocalDate(date);
    const day = state.stipendDay;
    let start;
    if (d.getDate() >= day) {
      start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (day > last) start = fmtYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    } else {
      start = addMonths(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, -1);
      start = start.slice(0, 8) + String(Math.min(day, new Date(parseLocalDate(start).getFullYear(), parseLocalDate(start).getMonth() + 1, 0).getDate())).padStart(2, '0');
    }
    return start;
  }

  function buildCycles() {
    const today = getToday();
    const cycles = [];
    if (!state.stipend) return cycles;

    let start = cycleStartFor(state.startDate);
    let guard = 0;
    let idx = 0;
    while (diffDays(start, state.endDate) >= 0 && guard++ < 60) {
      const next = addMonths(start, 1);
      const rangeStart = clampDate(start, state.startDate, state.endDate);
      const rangeEnd = clampDate(addDays(next, -1), state.startDate, state.endDate);
      const spent = sumTx(
        state.tx.filter(
          t => t.cat === CAT_FOOD && diffDays(rangeStart, t.date) >= 0 && diffDays(t.date, rangeEnd) >= 0
        )
      );
      // The stipend arrives in full each cycle, even one the plan starts or ends
      // mid-way through. A mid-month start can override the first cycle with
      // what's actually still in hand (state.opening).
      const funded = (idx === 0 && state.opening != null) ? state.opening : state.stipend;
      idx++;
      cycles.push({
        start: rangeStart,
        end: rangeEnd,
        funded,
        spent,
        closed: diffDays(rangeEnd, today) > 0
      });
      start = next;
    }
    return cycles;
  }

  // Walks every day of the plan once: weekly allowance with within-week rollover,
  // surplus banked at each Monday, deficit drawn from the bank before it carries.
  function buildTimeline(dailyBase) {
    const today = getToday();
    const days = [];
    const byDate = Object.create(null);
    const weeks = [];
    const total = diffDays(state.startDate, state.endDate) + 1;
    if (total <= 0) return { days, byDate, weeks, banked: 0, carry: 0, weekAllowance: 0, weekSpent: 0 };

    // Group every in-range date by the Monday that owns it.
    const groups = [];
    let cursor = null;
    for (let i = 0; i < total; i++) {
      const date = addDays(state.startDate, i);
      const key = mondayOf(date);
      if (!cursor || cursor.key !== key) {
        cursor = { key, dates: [] };
        groups.push(cursor);
      }
      cursor.dates.push(date);
    }

    let banked = 0;
    let carry = 0; // <= 0, an unpaid deficit dragged into the current week
    let curAllowance = 0;
    let curSpent = 0;

    groups.forEach((g, gi) => {
      const carryIn = carry;
      const alloc = dailyBase * g.dates.length + carryIn;
      const last = g.dates[g.dates.length - 1];
      const closed = diffDays(last, today) > 0;
      const isCurrent = !closed && diffDays(g.dates[0], today) <= 0;
      const bankBefore = banked;
      let spentSoFar = 0;

      g.dates.forEach((date, i) => {
        const future = diffDays(today, date) > 0;
        // Everything the week has granted through today, less what it already took.
        const allowance = dailyBase * (i + 1) + carryIn - spentSoFar;
        const spent = future ? 0 : spentOn(date, CAT_OUT);
        const row = {
          date,
          allowance,
          spent,
          remaining: allowance - spent,
          weekKey: g.key,
          weekIndex: gi,
          future,
          isToday: date === today
        };
        spentSoFar += spent;
        days.push(row);
        byDate[date] = row;
      });

      const surplus = alloc - spentSoFar;

      if (closed) {
        carry = 0;
        banked += surplus;
        if (banked < 0) {
          carry = banked; // bank is empty; the rest follows you into next week
          banked = 0;
        }
      } else if (isCurrent) {
        curAllowance = alloc;
        curSpent = spentSoFar;
      }

      weeks.push({
        index: gi,
        key: g.key,
        dates: g.dates,
        carryIn,
        alloc,
        spent: spentSoFar,
        surplus,
        closed,
        isCurrent,
        bankBefore,
        bankAfter: closed ? banked : bankBefore
      });
    });

    return { days, byDate, weeks, banked, carry, weekAllowance: curAllowance, weekSpent: curSpent };
  }

  function compute() {
    const today = getToday();
    const totalDays = Math.max(0, diffDays(state.startDate, state.endDate) + 1);
    const elapsed = Math.min(totalDays, Math.max(0, diffDays(state.startDate, today) + 1));
    const daysLeft = Math.max(0, totalDays - elapsed);

    const planned = state.planned.map(p => {
      const spent = sumTx(state.tx.filter(t => t.pid === p.id));
      // Hold the full reserve until it's settled; overspend reserves itself.
      const reserve = p.done ? spent : Math.max(p.amount, spent);
      return Object.assign({}, p, { spent, reserve });
    });
    const reserveTotal = planned.reduce((s, p) => s + p.reserve, 0);
    const asideLeft = planned.reduce((s, p) => s + Math.max(0, p.reserve - p.spent), 0);

    const cycles = buildCycles();
    // Grocery leftovers roll into their own jar when a cycle closes. Nothing else
    // feeds it; it only drains — by logging against it, or by a grocery overage,
    // which bites the jar first and discretionary only once the jar is dry.
    let saved = 0;
    let overage = 0;
    for (const c of cycles) {
      const left = c.funded - c.spent;
      if (left < 0) overage -= left;          // closed or live, an overage bites immediately
      else if (c.closed) saved += left;
    }
    const spentSave = sumTx(state.tx.filter(t => t.cat === CAT_SAVE));
    const saveLeft = saved - overage - spentSave;
    const spill = Math.min(0, saveLeft);      // an overdrawn jar is the only thing that reaches discretionary
    const cycle = cycles.find(c => !c.closed) || null;

    const discPool = state.pool - reserveTotal + spill;
    const dailyBase = totalDays > 0 ? discPool / totalDays : 0;

    const tl = buildTimeline(dailyBase);
    const todayRow = tl.byDate[today] || null;

    const spentOut = sumTx(state.tx.filter(t => t.cat === CAT_OUT));

    return {
      today,
      totalDays,
      elapsed,
      daysLeft,
      planned,
      reserveTotal,
      asideLeft,
      cycles,
      cycle,
      spill,
      saved,
      saveLeft,
      hasSavings: saved > 0 || spentSave > 0,
      discPool,
      discLeft: discPool - spentOut,
      dailyBase,
      timeline: tl,
      todayRow,
      spentToday: spentOn(today, CAT_OUT),
      spentOut,
      banked: tl.banked,
      weekNo: Math.floor(diffDays(mondayOf(state.startDate), mondayOf(today)) / 7) + 1,
      weekTotal: tl.weeks.length
    };
  }

  // Daily figure for a hypothetical plan — used by the setup flow and plan editor.
  function spreadOf(pool, reserved, start, end) {
    const days = diffDays(start, end) + 1;
    if (!(days > 0)) return 0;
    return Math.max(0, pool - reserved) / days;
  }

  // ============================================
  // Formatting
  // ============================================

  // Shrink-wrap an inline text field to its value so the underline hugs the text.
  function fitName(el) {
    el.style.width = `${Math.max(3, el.value.length) + 1}ch`;
  }

  // The discretionary envelope is whatever the user called it in setup.
  function outName() {
    return (state && state.outName && state.outName.trim()) || 'Going out';
  }

  function money(n) {
    return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function moneyShort(n) {
    const a = Math.abs(n);
    return a >= 100
      ? Math.round(a).toLocaleString('en-US')
      : a.toFixed(2).replace(/\.00$/, '');
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // "Aug 24" — the receipt's date shorthand.
  function fmtShort(s) {
    const d = parseLocalDate(s);
    return `${MON[d.getMonth()]} ${d.getDate()}`;
  }

  // "Sat 5 Sep"
  function fmtDayShort(s) {
    const d = parseLocalDate(s);
    return `${WD[(d.getDay() + 6) % 7]} ${d.getDate()} ${MON[d.getMonth()]}`;
  }

  // "Mon 24 Aug 2026"
  function fmtDayLong(s) {
    return `${fmtDayShort(s)} ${parseLocalDate(s).getFullYear()}`;
  }

  function fmtRange(a, b) {
    return `${fmtShort(a)} → ${fmtShort(b)}`;
  }

  function weekRange(w) {
    return `${fmtShort(w.dates[0])} – ${fmtShort(w.dates[w.dates.length - 1])}`;
  }

  // ============================================
  // Elements
  // ============================================

  const el = {};

  function $(id) {
    if (!(id in el)) el[id] = document.getElementById(id);
    return el[id];
  }

  const SCREENS = ['setup', 'home', 'calendar', 'week', 'plan'];

  function show(screen) {
    SCREENS.forEach(s => {
      const node = $(`${s}-screen`);
      if (node) node.classList.toggle('is-hidden', s !== screen);
    });
    document.body.classList.toggle('has-dock', screen === 'home' || screen === 'setup');
    if (screen !== 'setup') document.body.classList.remove('keypad-up');
  }

  let toastTimer = null;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('is-up');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('is-up'), 2200);
  }

  function shake(node) {
    if (!node) return;
    node.classList.add('shake');
    setTimeout(() => node.classList.remove('shake'), 400);
  }

  // ============================================
  // Ground
  // ============================================

  function setGround(g, persist) {
    const ground = GROUNDS[g] ? g : 'paper';
    document.documentElement.setAttribute('data-ground', ground);
    $('theme-color').setAttribute('content', GROUNDS[ground]);
    if (persist) localStorage.setItem(GROUND_KEY, ground);
    document.querySelectorAll('[data-set-ground]').forEach(b => {
      b.classList.toggle('is-on', b.dataset.setGround === ground);
    });
  }

  function initGround() {
    const saved = localStorage.getItem(GROUND_KEY);
    if (saved) return setGround(saved, false);
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setGround(dark ? 'carbon' : 'paper', false);
  }

  // ============================================
  // Shared row builders
  // ============================================

  function leaderLine(k, v, opts) {
    const o = opts || {};
    const cls = ['line', o.quiet ? 'is-quiet' : '', o.over ? 'is-over' : '', o.total ? 'line-total' : '']
      .filter(Boolean).join(' ');
    const sub = o.sub ? `<span class="k-sub"> · ${escapeHtml(o.sub)}</span>` : '';
    return `<div class="${cls}"><span class="k">${escapeHtml(k)}${sub}</span><span class="lead"></span><span class="v">${escapeHtml(v)}</span></div>`;
  }

  function txLine(t, v, opts) {
    const o = opts || {};
    let tag = outName();
    if (t.cat === CAT_FOOD) tag = 'Groceries';
    if (t.cat === CAT_SAVE) tag = 'Savings';
    if (t.cat === CAT_PLAN) {
      const p = v.planned.find(x => x.id === t.pid);
      tag = p ? p.name : 'Set aside';
    }
    const quiet = t.cat !== CAT_OUT;
    const label = t.note || tag;
    const badge = t.note && t.cat !== CAT_OUT ? `<span class="tag"> · ${escapeHtml(tag.toUpperCase())}</span>` : '';
    return `
      <div class="line${quiet ? ' is-quiet' : ''}">
        <span class="time">${fmtTime(t.ts)}</span>
        <span class="what">${escapeHtml(label)}${badge}</span>
        <span class="lead"></span>
        <span class="v">${money(t.amount)}</span>
        ${o.del === false ? '' : `<button type="button" class="del" data-del="${escapeHtml(t.id)}" aria-label="Remove ${escapeHtml(label)}">&times;</button>`}
      </div>`;
  }

  // ============================================
  // Home
  // ============================================

  let view = null;

  function render() {
    if (!state) return;
    view = compute();
    const v = view;

    $('plan-range').textContent = fmtRange(state.startDate, state.endDate);

    const row = v.todayRow;
    const allowance = row ? row.allowance : 0;
    const spent = v.spentToday;
    const over = row ? row.remaining < 0 : false;

    $('today-eyebrow').textContent = `Today · ${fmtDayShort(v.today)}${over ? ' · over' : ''}`;
    $('today-eyebrow').style.color = over ? 'var(--accent)' : '';

    $('hero-amount').textContent = money(spent);
    $('hero').classList.toggle('is-over', over);

    renderHeroSub(v, row, allowance, over);

    renderRespread(v, over);
    renderWeekStrip(v);
    renderEnvelopes(v);
    renderLedger(v);
    renderCats(v);
  }

  // "of 16.60 allowed · 52.40 banked" — the bank is a win counter, not spendable,
  // so it stays a quiet trailing clause and never joins the figure.
  function renderHeroSub(v, row, allowance, over) {
    const parts = [`<span>of ${escapeHtml(moneyShort(allowance))} allowed</span>`];
    if (over) parts.push(`<span class="over-text">${escapeHtml(moneyShort(row.remaining))} over</span>`);
    if (v.banked >= 0.005 && v.timeline.weeks.some(w => w.closed)) {
      parts.push(`
        <button type="button" id="banked-btn" class="banked">
          ${escapeHtml(moneyShort(v.banked))} banked
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>`);
    }
    $('hero-sub').innerHTML = parts.join('<span class="dot">·</span>');
  }

  // When today runs over, say plainly what tomorrow looks like. Nothing is broken.
  function renderRespread(v, over) {
    const node = $('respread');
    const tomorrow = addDays(v.today, 1);
    const row = v.timeline.byDate[tomorrow];
    if (!over || !row) {
      node.classList.add('is-hidden');
      return;
    }
    const sameWeek = mondayOf(tomorrow) === mondayOf(v.today);
    let lead;
    if (row.allowance < 0) {
      lead = `Tomorrow opens <strong>$${money(row.allowance)}</strong> down`;
    } else {
      lead = `Tomorrow ${sameWeek ? 'drops to' : 'resets to'} <strong>$${money(row.allowance)}</strong>`;
    }
    const tail = sameWeek
      ? 'and the rest of the week trims with it.'
      : 'as the new week opens.';
    node.innerHTML = `<span>${lead} ${tail} Nothing is broken — the plan just re-spreads.</span>`;
    node.classList.remove('is-hidden');
  }

  function renderWeekStrip(v) {
    const monday = mondayOf(v.today);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const row = v.timeline.byDate[date];
      const letter = WD[i][0];
      if (!row) {
        cells.push(`<div class="wcell is-blank"><span class="d">${letter}</span><span class="n">·</span></div>`);
        continue;
      }
      const over = row.remaining < 0;
      const cls = ['wcell', row.isToday ? 'is-today' : '', over ? 'is-over' : '', row.future ? 'is-future' : '']
        .filter(Boolean).join(' ');
      const mark = row.future || row.spent <= 0 ? '—' : moneyShort(row.spent);
      cells.push(`<div class="${cls}"><span class="d">${letter}</span><span class="n">${mark}</span></div>`);
    }
    $('week-strip').innerHTML = cells.join('');
  }

  function renderEnvelopes(v) {
    const out = [];
    out.push(leaderLine(outName().toUpperCase(), money(v.discLeft), {
      sub: `${v.daysLeft}d`,
      over: v.discLeft < 0
    }));

    if (state.stipend && v.cycle) {
      const left = v.cycle.funded - v.cycle.spent;
      const toGo = Math.max(0, diffDays(v.today, v.cycle.end));
      out.push(leaderLine('GROCERIES', money(left), { sub: `${toGo}d`, over: left < 0 }));
    }

    if (state.stipend) {
      const sub = v.hasSavings
        ? `${moneyShort(v.saved)} rolled in`
        : (v.cycle ? `rolls in ${fmtShort(addDays(v.cycle.end, 1))}` : '');
      out.push(leaderLine('GROCERY SAVINGS', money(v.saveLeft), { sub, over: v.saveLeft < 0, quiet: !v.hasSavings }));
    }

    if (v.planned.length) {
      out.push(leaderLine('SET ASIDE', money(v.asideLeft)));
      const subs = v.planned.map(p => {
        const left = Math.max(0, p.reserve - p.spent);
        let note;
        if (p.done) note = 'settled';
        else if (p.spent <= 0) note = 'untouched';
        else note = `${moneyShort(p.spent)} of ${moneyShort(p.amount)} spent`;
        return `<div class="line"><span class="k">${escapeHtml(p.name)}<span class="k-sub"> · ${escapeHtml(note)}</span></span><span class="lead"></span><span class="v">${money(left)}</span></div>`;
      });
      out.push(`<div class="sublines">${subs.join('')}</div>`);
    }

    $('env-lines').innerHTML = out.join('');
  }

  function renderLedger(v) {
    const rows = state.tx.filter(t => t.date === v.today).sort((a, b) => b.ts - a.ts);
    $('ledger-empty').classList.toggle('is-hidden', rows.length > 0);
    $('ledger').innerHTML = rows.map(t => txLine(t, v)).join('');
  }

  // ============================================
  // Log tray
  // ============================================

  const KEYPAD = `
    <button type="button" data-key="1">1</button>
    <button type="button" data-key="2">2</button>
    <button type="button" data-key="3">3</button>
    <button type="button" data-key="4">4</button>
    <button type="button" data-key="5">5</button>
    <button type="button" data-key="6">6</button>
    <button type="button" data-key="7">7</button>
    <button type="button" data-key="8">8</button>
    <button type="button" data-key="9">9</button>
    <button type="button" data-key="." class="key-alt">.</button>
    <button type="button" data-key="0">0</button>
    <button type="button" data-key="del" class="key-alt" aria-label="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M20 6H9l-5 6 5 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="M17 10l-4 4M13 10l4 4"/>
      </svg>
    </button>`;

  let entry = { raw: '', cat: CAT_OUT, pid: null, keypad: true };

  function renderCats(v) {
    if (!v) return;
    const tabs = [
      { key: CAT_OUT, pid: null, label: outName() },
      ...(state.stipend ? [{ key: CAT_FOOD, pid: null, label: 'Groceries' }] : []),
      ...(v.saveLeft > 0 ? [{ key: CAT_SAVE, pid: null, label: 'Savings' }] : []),
      ...v.planned.filter(p => !p.done).map(p => ({ key: CAT_PLAN, pid: p.id, label: p.name }))
    ];
    const html = tabs.map(c => {
      const on = entry.cat === c.key && entry.pid === c.pid;
      return `<button type="button" class="tab${on ? ' is-on' : ''}" data-cat="${c.key}" data-pid="${c.pid || ''}">${escapeHtml(c.label)}</button>`;
    }).join('');
    if ($('sheet-cats').dataset.sig === html) return;
    $('sheet-cats').dataset.sig = html;
    $('sheet-cats').innerHTML = html;
  }

  function entryValue() {
    const n = parseFloat(entry.raw);
    return isFinite(n) ? n : 0;
  }

  function renderTray() {
    if (!view) return;
    $('sheet-amount').textContent = entry.raw === '' ? '0' : entry.raw;
    $('sheet-keypad').classList.toggle('is-hidden', !entry.keypad);
    $('sheet-amount-figure').classList.toggle('is-editing', entry.keypad);

    const amt = entryValue();
    const line = $('sheet-consequence');

    if (amt <= 0) {
      line.textContent = 'Pick an amount';
      line.style.color = '';
      $('sheet-save').disabled = true;
      $('sheet-save').textContent = 'Enter an amount';
      renderCats(view);
      return;
    }
    $('sheet-save').disabled = false;
    $('sheet-save').textContent = `Log $${money(amt)}`;

    let text;
    let over = false;
    if (entry.cat === CAT_OUT) {
      const after = (view.todayRow ? view.todayRow.remaining : 0) - amt;
      over = after < 0;
      text = over ? `${money(after)} over today` : `leaves ${money(after)} today`;
    } else if (entry.cat === CAT_FOOD) {
      const left = view.cycle ? view.cycle.funded - view.cycle.spent - amt : -amt;
      over = left < 0;
      text = over ? `groceries ${money(left)} over` : `leaves ${money(left)} of groceries`;
    } else if (entry.cat === CAT_SAVE) {
      const left = view.saveLeft - amt;
      over = left < 0;
      text = over ? `${money(left)} more than you've saved` : `leaves ${money(left)} saved`;
    } else {
      const p = view.planned.find(x => x.id === entry.pid);
      const left = p ? p.amount - p.spent - amt : -amt;
      over = left < 0;
      text = over ? `${money(left)} past what you set aside` : `${money(left)} still set aside`;
    }
    line.textContent = text;
    line.style.color = over ? 'var(--accent)' : '';
    renderCats(view);
  }

  function openTray() {
    if (!state || !view) return;
    entry = { raw: '', cat: CAT_OUT, pid: null, keypad: true };
    $('sheet-note').value = '';
    $('sheet-cats').dataset.sig = '';
    renderTray();
    $('sheet').classList.add('is-open');
    document.body.classList.add('is-locked');
  }

  function closeTray() {
    $('sheet').classList.remove('is-open');
    document.body.classList.remove('is-locked');
    $('sheet-note').blur();
  }

  function pressKey(k, raw, onChange) {
    let next = raw;
    if (k === 'del') {
      next = next.slice(0, -1);
    } else if (k === '.') {
      if (!next.includes('.')) next = (next || '0') + '.';
    } else {
      if (next.includes('.') && next.split('.')[1].length >= 2) return;
      if (next === '0') next = k;
      else if (next.replace('.', '').length < 7) next += k;
    }
    onChange(next);
  }

  function saveEntry() {
    const amount = Math.round(entryValue() * 100) / 100;
    if (amount <= 0) return;
    state.tx.push({
      id: uid(),
      date: getToday(),
      ts: Date.now(),
      amount,
      note: $('sheet-note').value.trim(),
      cat: entry.cat,
      pid: entry.cat === CAT_PLAN ? entry.pid : null
    });
    saveState();
    closeTray();
    render();
    toast(`Logged ${money(amount)}`);
  }

  function deleteTx(id) {
    const i = state.tx.findIndex(t => t.id === id);
    if (i === -1) return;
    const [gone] = state.tx.splice(i, 1);
    saveState();
    render();
    if ($('day-sheet').classList.contains('is-open') && openDayDate) openDay(openDayDate);
    else toast(`Removed ${money(gone.amount)}`);
  }

  // ============================================
  // Calendar
  // ============================================

  let calMonth = null;
  let openDayDate = null;

  function renderCalendar() {
    $('cal-sub').textContent = `${outName()}, by day`;
    const v = view;
    const d = parseLocalDate(calMonth);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysIn = new Date(year, month + 1, 0).getDate();
    const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first

    $('cal-title').textContent = `${parseLocalDate(calMonth).toLocaleDateString([], { month: 'long' })} ${year}`;
    $('cal-prev').disabled = diffDays(state.startDate, addDays(calMonth, -1)) < 0;
    $('cal-next').disabled = diffDays(addMonths(calMonth, 1), state.endDate) < 0;

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="ccell is-void"></div>');

    let mtd = 0;
    let counted = 0;

    for (let n = 1; n <= daysIn; n++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      const row = v.timeline.byDate[date];
      if (!row) {
        cells.push(`<div class="ccell is-void"><span class="d">${n}</span></div>`);
        continue;
      }
      if (!row.future) {
        mtd += row.spent;
        counted++;
      }
      const over = row.remaining < 0;
      const cls = ['ccell', row.future ? 'is-future' : '', over ? 'is-over' : '', row.isToday ? 'is-today' : '']
        .filter(Boolean).join(' ');
      const mark = row.future ? '' : `<span class="n">${row.spent > 0 ? moneyShort(row.spent) : '—'}</span>`;
      cells.push(`<button type="button" class="${cls}" data-date="${date}"><span class="d">${n}</span>${mark}</button>`);
    }

    $('cal-grid').innerHTML = cells.join('');
    $('cal-mtd').textContent = counted ? money(mtd) : '—';
    $('cal-avg').textContent = counted ? money(mtd / counted) : '—';
  }

  function openDay(date) {
    const row = view.timeline.byDate[date];
    if (!row) return;
    openDayDate = date;

    $('day-title').textContent = fmtDayShort(date);
    $('day-allowance').textContent = money(row.allowance);
    $('day-spent').textContent = money(row.spent);

    const over = row.remaining < 0;
    $('day-third').classList.toggle('is-over', over);
    $('day-third-k').textContent = over ? 'Over' : 'Left';
    $('day-third-v').textContent = money(row.remaining);

    const rows = state.tx.filter(t => t.date === date).sort((a, b) => b.ts - a.ts);
    $('day-list').innerHTML = rows.length
      ? rows.map(t => txLine(t, view)).join('')
      : '<p class="empty">Nothing logged</p>';
    $('day-note').textContent = row.future
      ? 'Projected — assumes nothing spent between now and then'
      : 'Tap × to remove an item · groceries sit outside the day\'s allowance';

    $('day-sheet').classList.add('is-open');
    document.body.classList.add('is-locked');
  }

  function closeDay() {
    $('day-sheet').classList.remove('is-open');
    document.body.classList.remove('is-locked');
    openDayDate = null;
  }

  // ============================================
  // Week close
  // ============================================

  let weekIndex = 0;

  function weekDayLines(w) {
    return w.dates.map(date => {
      const row = view.timeline.byDate[date];
      const dow = WD[(parseLocalDate(date).getDay() + 6) % 7].toUpperCase();
      if (!row) return leaderLine(dow, '—', { quiet: true });
      const over = row.remaining < 0;
      const val = row.future || row.spent <= 0 ? '—' : money(row.spent);
      return `<div class="line${over ? ' is-over' : ''}"><span class="k${over ? '' : ' k-sub'}">${dow}</span><span class="lead"></span><span class="v">${val}</span></div>`;
    }).join('');
  }

  function groceryNoteFor(w) {
    if (!state.stipend) return '';
    const spent = sumTx(state.tx.filter(
      t => t.cat === CAT_FOOD && diffDays(w.dates[0], t.date) >= 0 && diffDays(t.date, w.dates[w.dates.length - 1]) >= 0
    ));
    return spent > 0 ? `Groceries ${money(spent)} · not counted here` : '';
  }

  function renderWeek() {
    const weeks = view.timeline.weeks;
    if (!weeks.length) return;
    weekIndex = Math.max(0, Math.min(weeks.length - 1, weekIndex));
    const w = weeks[weekIndex];

    $('week-count').textContent = `Week ${w.index + 1} of ${weeks.length}`;
    $('week-range').textContent = `${weekRange(w)} · ${w.closed ? 'closed' : 'open'}`;

    const banked = w.surplus;
    $('week-figure').textContent = money(banked);
    $('week-figure').parentElement.classList.toggle('is-over', banked < 0);
    $('week-figure-sub').textContent = w.closed
      ? (banked >= 0 ? `banked into week ${w.index + 2}` : 'drawn from the bank')
      : (banked >= 0 ? 'unspent so far this week' : 'over so far this week');

    $('week-days').innerHTML = weekDayLines(w);
    $('week-allowance').textContent = money(w.alloc);
    $('week-spent').textContent = money(w.spent);
    $('week-total-k').textContent = banked < 0 ? 'OVER' : 'BANKED';
    $('week-banked').textContent = money(banked);

    const note = groceryNoteFor(w);
    $('week-note').textContent = note;
    $('week-note').classList.toggle('is-hidden', !note);

    $('week-prev').disabled = weekIndex <= 0;
    $('week-next').disabled = weekIndex >= weeks.length - 1;
  }

  // ============================================
  // Monday recap
  // ============================================

  function lastClosedWeek() {
    const weeks = view ? view.timeline.weeks : [];
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i].closed) return weeks[i];
    }
    return null;
  }

  function maybeRecap() {
    const w = lastClosedWeek();
    if (!w || state.recapSeen === w.key) return;

    $('recap-range').textContent = `Week ${w.index + 1} closed · ${weekRange(w)}`;
    const banked = w.surplus;
    $('recap-figure').textContent = money(banked);
    $('recap-figure').parentElement.classList.toggle('is-over', banked < 0);
    $('recap-sub').textContent = banked >= 0 ? 'banked into this week' : 'over — taken from the bank';
    $('recap-days').innerHTML = weekDayLines(w);
    $('recap-allowance').textContent = money(w.alloc);
    $('recap-spent').textContent = money(w.spent);
    $('recap-carried').textContent = money(w.bankBefore);
    $('recap-bank').textContent = money(w.bankAfter);

    const note = groceryNoteFor(w);
    $('recap-note').textContent = note;
    $('recap-note').classList.toggle('is-hidden', !note);
    $('recap-ok').textContent = `Start week ${w.index + 2}`;
    $('recap-ok').dataset.week = w.key;

    $('recap-sheet').classList.add('is-open');
    document.body.classList.add('is-locked');
  }

  function closeRecap() {
    state.recapSeen = $('recap-ok').dataset.week || state.recapSeen;
    saveState();
    $('recap-sheet').classList.remove('is-open');
    document.body.classList.remove('is-locked');
  }

  // ============================================
  // Edit plan
  // ============================================

  let planBaseDaily = 0;

  function asideEditRows(items, withSpend) {
    return items.map(p => {
      const note = withSpend && p.spent > 0 ? `<span class="a-note">· ${moneyShort(p.spent)} spent</span>` : '';
      return `
        <div class="aside-row" data-id="${escapeHtml(p.id)}">
          <input type="text" class="a-name" value="${escapeHtml(p.name)}" placeholder="What for" maxlength="28">
          ${note}
          <span class="lead"></span>
          <input type="number" class="a-amt" value="${p.amount || ''}" placeholder="0" min="0" step="1" inputmode="decimal">
          <button type="button" class="del" data-drop="${escapeHtml(p.id)}" aria-label="Remove">&times;</button>
        </div>`;
    }).join('');
  }

  function openPlan() {
    planBaseDaily = view.dailyBase;
    renderPlan();
    show('plan');
  }

  function renderPlan() {
    const v = compute();
    $('p-pool-text').textContent = money(state.pool);
    $('p-pool').value = state.pool;
    $('p-name').value = outName();
    fitName($('p-name'));
    $('p-end-text').textContent = fmtDayLong(state.endDate);
    $('p-end').value = state.endDate;
    $('p-end').min = addDays(state.startDate, 1);
    $('p-start').textContent = fmtDayLong(state.startDate);

    $('p-stipend-text').textContent = state.stipend ? `${money(state.stipend)} / mo` : 'none';
    $('p-stipend').value = state.stipend || '';
    $('p-day-text').textContent = ordinal(state.stipendDay);
    $('p-day').value = state.stipendDay;
    const first = v.cycles[0];
    const firstOpen = first && !first.closed;
    $('p-opening-row').classList.toggle('is-hidden', !state.stipend || !firstOpen);
    if (firstOpen) {
      $('p-opening-text').textContent = money(first.funded);
      $('p-opening').value = first.funded;
    }

    $('p-aside').innerHTML = asideEditRows(v.planned, true);
    $('p-daily').textContent = `${moneyShort(planBaseDaily)} → ${moneyShort(v.dailyBase)}`;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const k = n % 100;
    return `the ${n}${s[(k - 20) % 10] || s[k] || s[0]}`;
  }

  function commitPlanField() {
    const pool = parseFloat($('p-pool').value);
    if (pool > 0) state.pool = pool;

    const name = $('p-name').value.trim();
    if (name) state.outName = name;

    const end = $('p-end').value;
    if (end && diffDays(state.startDate, end) >= 1) state.endDate = end;

    const stipend = parseFloat($('p-stipend').value);
    state.stipend = isFinite(stipend) && stipend > 0 ? stipend : 0;

    const day = parseInt($('p-day').value, 10);
    state.stipendDay = Math.min(28, Math.max(1, isFinite(day) ? day : 1));

    // Only store an override when it differs from the stipend; otherwise stipend edits keep flowing through.
    const opening = parseFloat($('p-opening').value);
    if (!$('p-opening-row').classList.contains('is-hidden') && isFinite(opening) && opening >= 0) {
      state.opening = opening === state.stipend ? null : opening;
    }

    $('p-aside').querySelectorAll('.aside-row').forEach(r => {
      const p = state.planned.find(x => x.id === r.dataset.id);
      if (!p) return;
      const name = r.querySelector('.a-name').value.trim();
      const amt = parseFloat(r.querySelector('.a-amt').value);
      if (name) p.name = name;
      if (isFinite(amt) && amt >= 0) p.amount = amt;
    });

    saveState();
    renderPlan();
  }

  // Dropping a set-aside line must not lose the money already spent against it —
  // those items fall back into going out rather than vanishing from the totals.
  function dropPlanned(id) {
    const i = state.planned.findIndex(p => p.id === id);
    if (i === -1) return;
    const [gone] = state.planned.splice(i, 1);
    let moved = 0;
    state.tx.forEach(t => {
      if (t.pid === id) {
        t.cat = CAT_OUT;
        t.pid = null;
        t.note = t.note || gone.name;
        moved++;
      }
    });
    saveState();
    renderPlan();
    toast(moved ? `Removed · ${moved} item${moved > 1 ? 's' : ''} moved to ${outName()}` : 'Removed');
  }

  // ============================================
  // Setup
  // ============================================

  let wiz = null;

  function defaultEnd() {
    const today = getToday();
    const y = parseLocalDate(today).getFullYear();
    const dec = `${y}-12-15`;
    return diffDays(today, dec) > 14 ? dec : `${y + 1}-05-10`;
  }

  function newWizard() {
    return {
      step: 1,
      raw: '',
      name: 'Going out',
      start: getToday(),
      end: defaultEnd(),
      groceries: 'split',
      stipendRaw: '400',
      amountEdit: true,
      stipendEdit: false,
      aside: [{ id: uid(), name: '', amount: 0 }]
    };
  }

  function wizPool() {
    const n = parseFloat(wiz.raw);
    return isFinite(n) ? n : 0;
  }

  function wizReserved() {
    return wiz.aside.reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0);
  }

  function wizStipend() {
    const n = parseFloat(wiz.stipendRaw);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function wizDays() {
    return Math.max(0, diffDays(wiz.start, wiz.end) + 1);
  }

  function fillDateParts(prefix, iso) {
    const d = parseLocalDate(iso);
    const dayEl = $(`${prefix}-day`);
    const monthEl = $(`${prefix}-month`);
    const yearEl = $(`${prefix}-year`);
    const active = document.activeElement;
    if (active !== dayEl) dayEl.value = d.getDate();
    if (active !== monthEl) monthEl.value = String(d.getMonth());
    if (active !== yearEl) yearEl.value = d.getFullYear();
    $(`${prefix}-dow`).textContent = weekdayLong(iso);
  }

  function readDateParts(which) {
    const prefix = which === 'start' ? 's2-start' : 's2-end';
    const year = parseInt($(`${prefix}-year`).value, 10);
    const month = parseInt($(`${prefix}-month`).value, 10);
    const day = parseInt($(`${prefix}-day`).value, 10);
    if (!isFinite(year) || !isFinite(month) || !isFinite(day) || year < 2000) return;
    const next = composeYMD(year, month, day);
    if (which === 'start') {
      wiz.start = next;
      if (diffDays(wiz.start, wiz.end) < 1) wiz.end = addDays(wiz.start, 1);
    } else if (diffDays(wiz.start, next) >= 1) {
      wiz.end = next;
    }
  }

  function renderSetup() {
    const step = wiz.step;
    document.querySelectorAll('.step').forEach(n => {
      n.classList.toggle('is-hidden', Number(n.dataset.step) !== step);
    });

    $('setup-count').textContent = `${step} of 5`;
    $('setup-back').textContent = step === 1 ? 'New plan' : '← Back';
    $('setup-pips').innerHTML = [1, 2, 3, 4, 5]
      .map(i => `<span class="${i <= step ? 'is-on' : ''}"></span>`).join('');

    const keypadOn = (step === 1 && wiz.amountEdit) || (step === 3 && wiz.groceries === 'split' && wiz.stipendEdit);
    $('setup-keypad').classList.toggle('is-hidden', !keypadOn);
    document.body.classList.toggle('keypad-up', keypadOn);
    $('setup-next').textContent = step === 5 ? 'Start tracking' : 'Continue';

    const pool = wizPool();
    const days = wizDays();

    if (step === 1) {
      if (document.activeElement !== $('s1-name')) $('s1-name').value = wiz.name;
      fitName($('s1-name'));
      $('s1-amount').textContent = wiz.raw === '' ? '0' : formatRaw(wiz.raw);
      $('s1-daily').textContent = pool > 0 && days > 0 ? `${money(pool / days)} / day` : '—';
    }

    if (step === 2) {
      fillDateParts('s2-start', wiz.start);
      fillDateParts('s2-end', wiz.end);
      const weeks = Math.ceil(days / 7);
      $('s2-days').textContent = `${days} days`;
      $('s2-weeks').textContent = `${weeks} week${weeks === 1 ? '' : 's'}`;
      $('s2-bars').innerHTML = new Array(Math.max(1, Math.min(26, weeks))).fill('<span></span>').join('');
      $('s2-months').innerHTML = monthTicks(wiz.start, wiz.end);
      $('s2-over').textContent = `${moneyShort(pool)} OVER ${days} DAYS`;
      $('s2-daily').textContent = days > 0 ? `${money(pool / days)} / day` : '—';
    }

    if (step === 3) {
      document.querySelectorAll('[data-groceries]').forEach(b => {
        b.classList.toggle('is-on', b.dataset.groceries === wiz.groceries);
      });
      $('s3-stipend-block').classList.toggle('is-hidden', wiz.groceries !== 'split');
      $('s3-amount').textContent = wiz.stipendRaw === '' ? '0' : formatRaw(wiz.stipendRaw);
      const stipend = wizStipend();
      document.querySelectorAll('[data-stipend]').forEach(b => {
        b.classList.toggle('is-on', Number(b.dataset.stipend) === stipend && wiz.stipendRaw !== '');
      });
    }

    if (step === 4) {
      const reserved = wizReserved();
      $('s4-list').innerHTML = asideEditRows(wiz.aside, false);
      $('s4-pool').textContent = money(pool);
      $('s4-reserved').textContent = `− ${money(reserved)}`;
      $('s4-daily').textContent = days > 0 ? `${money(spreadOf(pool, reserved, wiz.start, wiz.end))} / day` : '—';
    }

    if (step === 5) {
      const reserved = wizReserved();
      const named = wiz.aside.filter(p => p.name.trim() && p.amount > 0);
      $('s5-range').textContent = `${fmtRange(wiz.start, wiz.end)} · ${days} days`;
      $('s5-pool').textContent = money(pool);
      $('s5-groceries-line').classList.toggle('is-hidden', wiz.groceries !== 'split' || !wizStipend());
      $('s5-groceries').textContent = `${money(wizStipend())} / mo`;
      $('s5-reserved').textContent = money(reserved);
      $('s5-aside').innerHTML = named
        .map(p => `<div class="line is-quiet"><span class="k">${escapeHtml(p.name)}</span><span class="lead"></span><span class="v">${money(p.amount)}</span></div>`)
        .join('');
      $('s5-aside').classList.toggle('is-hidden', !named.length);
      $('s5-daily').textContent = money(spreadOf(pool, reserved, wiz.start, wiz.end));
    }
  }

  function formatRaw(raw) {
    const [int, dec] = raw.split('.');
    const head = Number(int || 0).toLocaleString('en-US');
    return raw.includes('.') ? `${head}.${dec || ''}` : head;
  }

  function monthTicks(start, end) {
    const a = parseLocalDate(start);
    const b = parseLocalDate(end);
    const from = a.getFullYear() * 12 + a.getMonth();
    const to = b.getFullYear() * 12 + b.getMonth();
    const out = [];
    for (let m = from; m <= to && out.length < 12; m++) out.push(MON[m % 12]);
    return out.map(m => `<span>${m}</span>`).join('');
  }

  function readWizAside() {
    $('s4-list').querySelectorAll('.aside-row').forEach(r => {
      const p = wiz.aside.find(x => x.id === r.dataset.id);
      if (!p) return;
      p.name = r.querySelector('.a-name').value.trim();
      const amt = parseFloat(r.querySelector('.a-amt').value);
      p.amount = isFinite(amt) && amt > 0 ? amt : 0;
    });
  }

  function stepForward() {
    if (wiz.step === 1) {
      if (!(wizPool() > 0)) return shake($('s1-amount').parentElement);
    }
    if (wiz.step === 2) {
      if (wizDays() < 2) return shake($('s2-end-block'));
    }
    if (wiz.step === 4) {
      readWizAside();
      if (wizReserved() >= wizPool()) return shake($('s4-list'));
    }
    if (wiz.step === 5) return commitSetup();
    wiz.step++;
    renderSetup();
  }

  function stepBack() {
    if (wiz.step === 1) return;
    if (wiz.step === 5) { wiz.step = 4; renderSetup(); return; }
    if (wiz.step === 4) readWizAside();
    wiz.step--;
    renderSetup();
  }

  function commitSetup() {
    state = blankState();
    state.startDate = wiz.start;
    state.endDate = wiz.end;
    state.pool = wizPool();
    state.outName = wiz.name.trim() || 'Going out';
    state.stipend = wiz.groceries === 'split' ? wizStipend() : 0;
    state.stipendDay = 1;
    state.planned = wiz.aside
      .filter(p => p.name.trim() && p.amount > 0)
      .map(p => ({ id: p.id, name: p.name.trim(), amount: p.amount, done: false }));

    saveState();
    view = compute();
    // A backdated start shouldn't greet you with recaps for weeks you never saw.
    const w = lastClosedWeek();
    state.recapSeen = w ? w.key : null;
    saveState();

    show('home');
    render();
    toast('Plan started');
  }

  // ============================================
  // Confirm
  // ============================================

  let confirmResolve = null;

  function ask(title, body, okLabel) {
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    $('confirm-ok').textContent = okLabel;
    $('confirm-sheet').classList.add('is-open');
    document.body.classList.add('is-locked');
    return new Promise(resolve => { confirmResolve = resolve; });
  }

  function closeConfirm(answer) {
    $('confirm-sheet').classList.remove('is-open');
    document.body.classList.remove('is-locked');
    const done = confirmResolve;
    confirmResolve = null;
    if (done) done(answer);
  }

  function hideSetupKeypad() {
    if (!wiz || (!wiz.amountEdit && !wiz.stipendEdit)) return;
    wiz.amountEdit = false;
    wiz.stipendEdit = false;
    $('setup-keypad').classList.add('is-hidden');
    document.body.classList.remove('keypad-up');
  }

  function hideSheetKeypad() {
    if (!entry.keypad) return;
    entry.keypad = false;
    $('sheet-keypad').classList.add('is-hidden');
    $('sheet-amount-figure').classList.remove('is-editing');
  }

  let sheetPointerOnScrim = false;

  function keypadKeep(target) {
    return !!(target && target.closest && target.closest(
      '#setup-keypad, #sheet-keypad, #s1-figure, #s3-figure, #sheet-amount-figure, #sheet-cats, #sheet-note, #sheet .tray, #setup-next, #sheet-save, #sheet-cancel'
    ));
  }

  // ============================================
  // Events
  // ============================================

  function bind() {
    $('sheet-keypad').innerHTML = KEYPAD;
    $('setup-keypad').innerHTML = KEYPAD;

    // — Setup
    $('setup-next').addEventListener('click', stepForward);
    $('s1-name').addEventListener('input', e => { if (wiz) wiz.name = e.target.value; fitName(e.target); });
    $('p-name').addEventListener('input', e => fitName(e.target));
    $('s1-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
    $('setup-back').addEventListener('click', stepBack);
    $('setup-keypad').addEventListener('click', e => {
      const b = e.target.closest('[data-key]');
      if (!b || !wiz) return;
      const k = b.dataset.key;
      if (wiz.step === 1) {
        pressKey(k, wiz.raw, next => { wiz.raw = next; renderSetup(); });
      } else if (wiz.step === 3) {
        const fresh = ['250', '400', '550'].includes(wiz.stipendRaw) && k !== 'del' && k !== '.';
        pressKey(k, fresh ? '' : wiz.stipendRaw, next => { wiz.stipendRaw = next; renderSetup(); });
      }
    });
    const monthOpts = MON_LONG.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    $('s2-start-month').innerHTML = monthOpts;
    $('s2-end-month').innerHTML = monthOpts;
    ['start', 'end'].forEach(which => {
      ['day', 'month', 'year'].forEach(part => {
        $(`s2-${which}-${part}`).addEventListener('change', () => {
          readDateParts(which);
          renderSetup();
        });
      });
      $(`s2-${which}-day`).addEventListener('input', () => {
        readDateParts(which);
        renderSetup();
      });
      $(`s2-${which}-year`).addEventListener('input', () => {
        readDateParts(which);
        renderSetup();
      });
    });
    $('s1-figure').addEventListener('click', () => {
      wiz.amountEdit = true;
      renderSetup();
    });
    document.querySelectorAll('[data-groceries]').forEach(b => {
      b.addEventListener('click', () => {
        wiz.groceries = b.dataset.groceries;
        if (wiz.groceries !== 'split') wiz.stipendEdit = false;
        renderSetup();
      });
    });
    $('s3-figure').addEventListener('click', () => {
      wiz.stipendEdit = true;
      renderSetup();
    });
    $('s3-presets').addEventListener('click', e => {
      const b = e.target.closest('[data-stipend]');
      if (!b) return;
      wiz.stipendRaw = String(Number(b.dataset.stipend));
      renderSetup();
    });
    $('s4-add').addEventListener('click', () => {
      readWizAside();
      wiz.aside.push({ id: uid(), name: '', amount: 0 });
      renderSetup();
    });
    $('s4-list').addEventListener('click', e => {
      const b = e.target.closest('[data-drop]');
      if (!b) return;
      readWizAside();
      wiz.aside = wiz.aside.filter(p => p.id !== b.dataset.drop);
      if (!wiz.aside.length) wiz.aside.push({ id: uid(), name: '', amount: 0 });
      renderSetup();
    });
    $('s4-list').addEventListener('input', () => {
      readWizAside();
      const reserved = wizReserved();
      $('s4-reserved').textContent = `− ${money(reserved)}`;
      $('s4-daily').textContent = `${money(spreadOf(wizPool(), reserved, wiz.start, wiz.end))} / day`;
    });

    // — Home
    $('log-btn').addEventListener('click', openTray);
    $('calendar-btn').addEventListener('click', () => {
      render();
      calMonth = clampDate(getToday(), state.startDate, state.endDate).slice(0, 8) + '01';
      show('calendar');
      renderCalendar();
    });
    $('plan-btn').addEventListener('click', () => { render(); openPlan(); });
    $('hero-sub').addEventListener('click', e => {
      if (!e.target.closest('#banked-btn')) return;
      render();
      const w = lastClosedWeek();
      weekIndex = w ? w.index : 0;
      show('week');
      renderWeek();
    });
    $('ledger').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (b) deleteTx(b.dataset.del);
    });

    // — Log tray
    $('sheet-amount-figure').addEventListener('click', () => {
      $('sheet-note').blur();
      entry.keypad = true;
      renderTray();
    });
    $('sheet-note').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
    $('sheet-cancel').addEventListener('click', closeTray);
    $('sheet-save').addEventListener('click', saveEntry);
    $('sheet-keypad').addEventListener('click', e => {
      const b = e.target.closest('[data-key]');
      if (b) pressKey(b.dataset.key, entry.raw, next => { entry.raw = next; renderTray(); });
    });
    $('sheet-cats').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b) return;
      e.stopPropagation();
      entry.cat = b.dataset.cat;
      entry.pid = b.dataset.pid || null;
      renderTray();
    });
    const sheetTray = $('sheet').querySelector('.tray');
    sheetTray.addEventListener('pointerdown', e => e.stopPropagation());
    sheetTray.addEventListener('click', e => e.stopPropagation());
    $('sheet').addEventListener('pointerdown', e => {
      sheetPointerOnScrim = e.target === $('sheet');
    });
    $('sheet').addEventListener('click', e => {
      if (e.target !== $('sheet')) return;
      if (!sheetPointerOnScrim) return;
      closeTray();
    });

    // — Calendar
    $('cal-back').addEventListener('click', () => { show('home'); render(); });
    $('cal-prev').addEventListener('click', () => { calMonth = addMonths(calMonth, -1); renderCalendar(); });
    $('cal-next').addEventListener('click', () => { calMonth = addMonths(calMonth, 1); renderCalendar(); });
    $('cal-grid').addEventListener('click', e => {
      const c = e.target.closest('[data-date]');
      if (c) openDay(c.dataset.date);
    });
    $('day-close').addEventListener('click', closeDay);
    $('day-list').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (b) deleteTx(b.dataset.del);
    });
    $('day-sheet').addEventListener('click', e => {
      if (e.target === $('day-sheet')) closeDay();
    });

    // — Week
    $('week-back').addEventListener('click', () => { show('home'); render(); });
    $('week-prev').addEventListener('click', () => { weekIndex--; renderWeek(); });
    $('week-next').addEventListener('click', () => { weekIndex++; renderWeek(); });
    $('recap-ok').addEventListener('click', closeRecap);

    // — Plan
    $('plan-back').addEventListener('click', () => { show('home'); render(); });
    ['p-pool', 'p-name', 'p-end', 'p-stipend', 'p-day', 'p-opening'].forEach(id => {
      $(id).addEventListener('change', commitPlanField);
    });
    $('p-aside').addEventListener('change', commitPlanField);
    $('p-aside').addEventListener('click', e => {
      const b = e.target.closest('[data-drop]');
      if (b) dropPlanned(b.dataset.drop);
    });
    $('p-add').addEventListener('click', () => {
      commitPlanField();
      state.planned.push({ id: uid(), name: 'Something', amount: 0, done: false });
      saveState();
      renderPlan();
    });
    document.querySelectorAll('[data-set-ground]').forEach(b => {
      b.addEventListener('click', () => setGround(b.dataset.setGround, true));
    });
    $('p-reset').addEventListener('click', async () => {
      const ok = await ask(
        'Start a new plan?',
        'This clears your current plan and everything you have logged. It cannot be undone.',
        'Clear and start over'
      );
      if (!ok) return;
      localStorage.removeItem(STORAGE_KEY);
      state = null;
      view = null;
      wiz = newWizard();
      renderSetup();
      show('setup');
      toast('Plan cleared');
    });

    // — Confirm
    $('confirm-cancel').addEventListener('click', () => closeConfirm(false));
    $('confirm-ok').addEventListener('click', () => closeConfirm(true));
    $('confirm-sheet').addEventListener('click', e => {
      if (e.target === $('confirm-sheet')) closeConfirm(false);
    });

    document.addEventListener('click', e => {
      if (keypadKeep(e.target)) return;
      if (e.target.closest('#log-btn, #sheet .tray')) return;
      hideSetupKeypad();
      if ($('sheet').classList.contains('is-open')) hideSheetKeypad();
    });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if ($('confirm-sheet').classList.contains('is-open')) closeConfirm(false);
      else if ($('sheet').classList.contains('is-open') && entry.keypad) hideSheetKeypad();
      else if ($('sheet').classList.contains('is-open')) closeTray();
      else if ($('day-sheet').classList.contains('is-open')) closeDay();
      else hideSetupKeypad();
    });

    // iOS keyboards overlap the layout viewport rather than shrinking it. Track
    // the visual viewport so an open tray (and its Log button) stays above the keys.
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const fit = () => {
        const root = document.documentElement.style;
        root.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      fit();
    }

    // A phone sits idle for hours; make sure "today" is still today on return.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state) { render(); maybeRecap(); }
    });
  }

  function init() {
    initGround();
    bind();
    if (loadState()) {
      show('home');
      render();
      maybeRecap();
    } else {
      wiz = newWizard();
      renderSetup();
      show('setup');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
