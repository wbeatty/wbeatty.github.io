// Daily Spend - Budget Tracking App

(function() {
  'use strict';

  // ============================================
  // State Management
  // ============================================
  
  const STORAGE_KEY = 'dailySpend_budget';
  
  let state = null;

  function getDefaultState() {
    return {
      startAmount: 0,
      totalDays: 0,
      startDate: null,
      dailyBase: 0,
      transactions: []
    };
  }

  function saveState() {
    if (state) {
      delete state.savings;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        state = JSON.parse(saved);
        if ('savings' in state) {
          delete state.savings;
          saveState();
        }
        return true;
      } catch (e) {
        console.error('Failed to parse saved state:', e);
      }
    }
    return false;
  }

  function resetState() {
    state = getDefaultState();
    localStorage.removeItem(STORAGE_KEY);
  }

  // ============================================
  // Date Utilities
  // ============================================

  function parseLocalDate(dateStr) {
    // Always treat YYYY-MM-DD as local midnight to avoid timezone issues
    return new Date(dateStr + 'T00:00:00');
  }

  function formatDateYYYYMMDD(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDays(dateStr, daysToAdd) {
    const date = parseLocalDate(dateStr);
    date.setDate(date.getDate() + daysToAdd);
    return formatDateYYYYMMDD(date);
  }

  function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDateDiff(startDate, endDate) {
    // Parse as local dates to avoid timezone issues
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const diffTime = end - start;
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  function getCurrentDayIndex() {
    if (!state || !state.startDate) return 0;
    return getDateDiff(state.startDate, getToday());
  }

  function getDaysRemaining() {
    const dayIndex = getCurrentDayIndex();
    return Math.max(0, state.totalDays - dayIndex);
  }

  function isBudgetExpired() {
    return getCurrentDayIndex() >= state.totalDays;
  }

  // ============================================
  // Budget Calculations
  // ============================================

  function getTodayTransactions() {
    const today = getToday();
    return state.transactions.filter(t => t.date === today);
  }

  function getSpentToday() {
    return getTodayTransactions().reduce((sum, t) => sum + t.amount, 0);
  }

  function getTransactionsForDay(date) {
    return state.transactions.filter(t => t.date === date);
  }

  function getSpentOnDay(date) {
    return getTransactionsForDay(date).reduce((sum, t) => sum + t.amount, 0);
  }

  function buildDailyTimeline({ includeFuture = true } = {}) {
    if (!state || !state.startDate || !state.totalDays) return [];

    const today = getToday();
    const timeline = [];

    let rollover = 0;

    for (let dayIndex = 0; dayIndex < state.totalDays; dayIndex++) {
      const date = addDays(state.startDate, dayIndex);
      const isFuture = getDateDiff(today, date) > 0;

      if (!includeFuture && isFuture) break;

      const allowance = state.dailyBase + rollover;
      const spent = isFuture ? 0 : getSpentOnDay(date);
      const remaining = allowance - spent;
      // All leftover (or deficit) carries into the next day's available balance.
      const rolloverNext = remaining;

      timeline.push({
        date,
        allowance,
        spent,
        remaining,
        rolloverNext,
        isFuture
      });

      rollover = rolloverNext;
    }

    return timeline;
  }

  // Leftover (or deficit) from all previous days becomes today's available extra.
  function calculateRollover() {
    const dayIndex = getCurrentDayIndex();
    let rollover = 0;

    for (let i = 0; i < dayIndex; i++) {
      const dateStr = addDays(state.startDate, i);
      const spent = getSpentOnDay(dateStr);
      const dayAllowance = state.dailyBase + rollover;
      rollover = dayAllowance - spent;
    }
    return rollover;
  }

  function getTodayAllowance() {
    return state.dailyBase + calculateRollover();
  }

  function getRemainingToday() {
    const allowance = getTodayAllowance();
    const spent = getSpentToday();
    return allowance - spent;
  }

  // ============================================
  // DOM Elements
  // ============================================

  const elements = {
    setupScreen: null,
    dashboardScreen: null,
    calendarScreen: null,
    setupForm: null,
    startAmountInput: null,
    totalDaysInput: null,
    spendForm: null,
    spendAmountInput: null,
    spendNoteInput: null,
    resetBtn: null,
    calendarBtn: null,
    calendarBackBtn: null,
    calendarPrevBtn: null,
    calendarNextBtn: null,
    calendarMonthTitle: null,
    calendarGrid: null,
    dayModal: null,
    dayModalClose: null,
    dayModalTitle: null,
    dayModalSubtitle: null,
    dayAllowance: null,
    daySpent: null,
    dayRemaining: null,
    dayRemainingWrapper: null,
    dayRolloverNext: null,
    dayTransactionsList: null,
    todayAllowance: null,
    daysRemaining: null,
    spentToday: null,
    remainingToday: null,
    remainingWrapper: null,
    progressFill: null,
    transactionsList: null
  };

  function cacheElements() {
    elements.setupScreen = document.getElementById('setup-screen');
    elements.dashboardScreen = document.getElementById('dashboard-screen');
    elements.calendarScreen = document.getElementById('calendar-screen');
    elements.setupForm = document.getElementById('setup-form');
    elements.startAmountInput = document.getElementById('start-amount');
    elements.totalDaysInput = document.getElementById('total-days');
    elements.spendForm = document.getElementById('spend-form');
    elements.spendAmountInput = document.getElementById('spend-amount');
    elements.spendNoteInput = document.getElementById('spend-note');
    elements.resetBtn = document.getElementById('reset-btn');
    elements.calendarBtn = document.getElementById('calendar-btn');
    elements.calendarBackBtn = document.getElementById('calendar-back-btn');
    elements.calendarPrevBtn = document.getElementById('calendar-prev-btn');
    elements.calendarNextBtn = document.getElementById('calendar-next-btn');
    elements.calendarMonthTitle = document.getElementById('calendar-month-title');
    elements.calendarGrid = document.getElementById('calendar-grid');
    elements.dayModal = document.getElementById('day-modal');
    elements.dayModalClose = document.getElementById('day-modal-close');
    elements.dayModalTitle = document.getElementById('day-modal-title');
    elements.dayModalSubtitle = document.getElementById('day-modal-subtitle');
    elements.dayAllowance = document.getElementById('day-allowance');
    elements.daySpent = document.getElementById('day-spent');
    elements.dayRemaining = document.getElementById('day-remaining');
    elements.dayRemainingWrapper = document.getElementById('day-remaining-wrapper');
    elements.dayRolloverNext = document.getElementById('day-rollover-next');
    elements.dayTransactionsList = document.getElementById('day-transactions-list');
    elements.todayAllowance = document.getElementById('today-allowance');
    elements.daysRemaining = document.getElementById('days-remaining');
    elements.spentToday = document.getElementById('spent-today');
    elements.remainingToday = document.getElementById('remaining-today');
    elements.remainingWrapper = document.getElementById('remaining-wrapper');
    elements.progressFill = document.getElementById('progress-fill');
    elements.transactionsList = document.getElementById('transactions-list');
  }

  // ============================================
  // UI Updates
  // ============================================

  function formatCurrency(amount) {
    return Math.abs(amount).toFixed(2);
  }

  function formatCalendarCurrency(amount) {
    return Math.floor(Math.abs(amount)).toString();
  }

  function getCalendarColorClass(remaining, allowance) {
    if (remaining < 0) {
      // Negative: red gradient
      const ratio = Math.min(Math.abs(remaining) / allowance, 1);
      if (ratio > 0.5) return 'calendar-day--red-high';
      if (ratio > 0.2) return 'calendar-day--red-medium';
      return 'calendar-day--red-low';
    } else {
      // Positive: green gradient based on how much is remaining
      const ratio = remaining / allowance;
      if (ratio > 0.8) return 'calendar-day--green-high';
      if (ratio > 0.5) return 'calendar-day--green-medium';
      if (ratio > 0.2) return 'calendar-day--green-low';
      return 'calendar-day--green-verylow';
    }
  }

  function showScreen(screenName) {
    elements.setupScreen.classList.toggle('hidden', screenName !== 'setup');
    elements.dashboardScreen.classList.toggle('hidden', screenName !== 'dashboard');
    if (elements.calendarScreen) {
      elements.calendarScreen.classList.toggle('hidden', screenName !== 'calendar');
    }
  }

  function updateDashboard() {
    const allowance = getTodayAllowance();
    const spent = getSpentToday();
    const remaining = allowance - spent;
    const daysLeft = getDaysRemaining();

    // Update values
    elements.todayAllowance.textContent = formatCurrency(allowance);
    elements.daysRemaining.textContent = daysLeft;
    elements.spentToday.textContent = formatCurrency(spent);
    
    // Remaining can be negative
    if (remaining < 0) {
      elements.remainingToday.textContent = formatCurrency(remaining);
      elements.remainingWrapper.classList.add('negative');
      elements.remainingWrapper.querySelector('.currency').textContent = '-$';
    } else {
      elements.remainingToday.textContent = formatCurrency(remaining);
      elements.remainingWrapper.classList.remove('negative');
      elements.remainingWrapper.querySelector('.currency').textContent = '$';
    }

    // Progress bar
    const progress = allowance > 0 ? Math.max(0, remaining / allowance) : 0;
    elements.progressFill.style.width = `${progress * 100}%`;
    
    // Progress bar color
    elements.progressFill.classList.remove('warning', 'danger');
    if (progress <= 0) {
      elements.progressFill.classList.add('danger');
    } else if (progress <= 0.25) {
      elements.progressFill.classList.add('warning');
    }

    // Update transactions list
    updateTransactionsList();
  }

  function updateTransactionsList() {
    const transactions = getTodayTransactions();
    
    if (transactions.length === 0) {
      elements.transactionsList.innerHTML = '<li class="empty-state">No spending logged yet</li>';
      return;
    }

    elements.transactionsList.innerHTML = transactions
      .map((t, index) => `
        <li>
          <div class="transaction-info">
            <span class="transaction-time">${formatTime(t.timestamp)}</span>
            ${t.note ? `<span class="transaction-note">${escapeHtml(t.note)}</span>` : ''}
          </div>
          <span class="transaction-amount">-$${formatCurrency(t.amount)}</span>
        </li>
      `)
      .reverse()
      .join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Remove after delay
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ============================================
  // Calendar UI
  // ============================================

  let calendarTimeline = [];
  let calendarByDate = new Map();
  let calendarMonthCursor = null; // YYYY-MM-DD within month

  function getBudgetEndDate() {
    return addDays(state.startDate, state.totalDays - 1);
  }

  function getMonthStart(dateStr) {
    const date = parseLocalDate(dateStr);
    date.setDate(1);
    return formatDateYYYYMMDD(date);
  }

  function addMonths(dateStr, monthsToAdd) {
    const date = parseLocalDate(dateStr);
    const d = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + monthsToAdd);
    // restore day if possible, but clamp to end of month
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(d, endOfMonth));
    return formatDateYYYYMMDD(date);
  }

  function getDaysInMonth(dateStr) {
    const d = parseLocalDate(dateStr);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  function isDateInBudgetRange(dateStr) {
    return getDateDiff(state.startDate, dateStr) >= 0 && getDateDiff(dateStr, getBudgetEndDate()) >= 0;
  }

  function getMonthTitle(dateStr) {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  function ensureCalendarData() {
    calendarTimeline = buildDailyTimeline({ includeFuture: true });
    calendarByDate = new Map(calendarTimeline.map(item => [item.date, item]));
  }

  function renderCalendar(monthDateStr) {
    if (!elements.calendarGrid) return;

    const monthStart = getMonthStart(monthDateStr);
    const monthTitle = getMonthTitle(monthStart);
    elements.calendarMonthTitle.textContent = monthTitle;

    const firstDay = parseLocalDate(monthStart);
    const startOffset = firstDay.getDay(); // 0 (Sun) .. 6 (Sat)
    const daysInMonth = getDaysInMonth(monthStart);

    const today = getToday();
    const budgetStartMonth = getMonthStart(state.startDate);
    const budgetEndMonth = getMonthStart(getBudgetEndDate());

    // Limit month navigation to budget range
    if (elements.calendarPrevBtn) {
      const canPrev = getDateDiff(budgetStartMonth, monthStart) > 0;
      elements.calendarPrevBtn.disabled = !canPrev;
      elements.calendarPrevBtn.classList.toggle('disabled', !canPrev);
    }
    if (elements.calendarNextBtn) {
      const canNext = getDateDiff(monthStart, budgetEndMonth) > 0;
      elements.calendarNextBtn.disabled = !canNext;
      elements.calendarNextBtn.classList.toggle('disabled', !canNext);
    }

    const cells = [];

    // 6 weeks (42 cells) to keep layout stable
    for (let cellIndex = 0; cellIndex < 42; cellIndex++) {
      const dayNumber = cellIndex - startOffset + 1;
      const isInMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

      if (!isInMonth) {
        cells.push('<button class="calendar-day calendar-day--empty" type="button" aria-hidden="true" tabindex="-1"></button>');
        continue;
      }

      const date = parseLocalDate(monthStart);
      date.setDate(dayNumber);
      const dateStr = formatDateYYYYMMDD(date);

      const inRange = isDateInBudgetRange(dateStr);
      const dayData = calendarByDate.get(dateStr) || null;
      const remaining = dayData ? dayData.remaining : 0;
      const allowance = dayData ? dayData.allowance : state.dailyBase;
      const remainingText = dayData ? formatCalendarCurrency(remaining) : '—';
      const remainingPrefix = dayData && remaining < 0 ? '-$' : '$';

      const isToday = dateStr === today;
      const isFuture = dayData ? dayData.isFuture : getDateDiff(today, dateStr) > 0;

      const classes = ['calendar-day'];
      if (!inRange) classes.push('calendar-day--disabled');
      if (isToday) classes.push('calendar-day--today');
      if (dayData && remaining < 0) classes.push('calendar-day--negative');
      if (dayData && remaining >= 0) classes.push('calendar-day--positive');
      if (inRange && isFuture) classes.push('calendar-day--projected');
      if (dayData) classes.push(getCalendarColorClass(remaining, allowance));

      cells.push(`
        <button
          class="${classes.join(' ')}"
          type="button"
          ${inRange ? `data-date="${dateStr}"` : 'disabled'}
          aria-label="${dateStr}"
        >
          <div class="calendar-day-number">${dayNumber}</div>
          <div class="calendar-day-amount">
            <span class="calendar-currency">${remainingPrefix}</span>${remainingText}
          </div>
        </button>
      `);
    }

    elements.calendarGrid.innerHTML = cells.join('');
  }

  function openDayModal(dateStr) {
    if (!elements.dayModal) return;
    const dayData = calendarByDate.get(dateStr);
    if (!dayData) return;

    elements.dayModalTitle.textContent = parseLocalDate(dateStr).toLocaleDateString([], {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    elements.dayModalSubtitle.textContent = dayData.isFuture ? 'Projected (assumes $0 spend)' : 'Snapshot';

    elements.dayAllowance.textContent = formatCurrency(dayData.allowance);
    elements.daySpent.textContent = formatCurrency(dayData.spent);
    elements.dayRolloverNext.textContent = formatCurrency(dayData.rolloverNext);

    if (dayData.remaining < 0) {
      elements.dayRemaining.textContent = formatCurrency(dayData.remaining);
      elements.dayRemainingWrapper.classList.add('negative');
      elements.dayRemainingWrapper.querySelector('.currency').textContent = '-$';
    } else {
      elements.dayRemaining.textContent = formatCurrency(dayData.remaining);
      elements.dayRemainingWrapper.classList.remove('negative');
      elements.dayRemainingWrapper.querySelector('.currency').textContent = '$';
    }

    // Transactions list (only meaningful for non-future, but show whatever exists)
    const tx = getTransactionsForDay(dateStr);
    if (!tx || tx.length === 0) {
      elements.dayTransactionsList.innerHTML = '<li class="empty-state">No spending logged</li>';
    } else {
      elements.dayTransactionsList.innerHTML = tx
        .map(t => `
          <li>
            <div class="transaction-info">
              <span class="transaction-time">${formatTime(t.timestamp)}</span>
              ${t.note ? `<span class="transaction-note">${escapeHtml(t.note)}</span>` : ''}
            </div>
            <span class="transaction-amount">-$${formatCurrency(t.amount)}</span>
          </li>
        `)
        .reverse()
        .join('');
    }

    elements.dayModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  function closeDayModal() {
    if (!elements.dayModal) return;
    elements.dayModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  // ============================================
  // Event Handlers
  // ============================================

  function handleSetupSubmit(e) {
    e.preventDefault();

    const startAmount = parseFloat(elements.startAmountInput.value);
    const totalDays = parseInt(elements.totalDaysInput.value, 10);

    if (!startAmount || startAmount <= 0) {
      elements.startAmountInput.parentElement.classList.add('shake');
      setTimeout(() => elements.startAmountInput.parentElement.classList.remove('shake'), 400);
      return;
    }

    if (!totalDays || totalDays <= 0) {
      elements.totalDaysInput.parentElement.classList.add('shake');
      setTimeout(() => elements.totalDaysInput.parentElement.classList.remove('shake'), 400);
      return;
    }

    // Initialize state
    state = {
      startAmount,
      totalDays,
      startDate: getToday(),
      dailyBase: startAmount / totalDays,
      transactions: []
    };

    saveState();
    showScreen('dashboard');
    updateDashboard();
  }

  function handleSpendSubmit(e) {
    e.preventDefault();

    const amount = parseFloat(elements.spendAmountInput.value);
    const note = elements.spendNoteInput.value.trim();

    if (!amount || amount <= 0) {
      elements.spendAmountInput.parentElement.classList.add('shake');
      setTimeout(() => elements.spendAmountInput.parentElement.classList.remove('shake'), 400);
      return;
    }

    // Add transaction
    state.transactions.push({
      date: getToday(),
      amount,
      note: note || null,
      timestamp: new Date().toISOString()
    });

    saveState();
    updateDashboard();

    // Clear inputs
    elements.spendAmountInput.value = '';
    elements.spendNoteInput.value = '';

    // Check if overspent
    const remaining = getRemainingToday();
    if (remaining < 0) {
      showToast('You\'ve exceeded today\'s budget!', 'warning');
    }
  }

  function handleReset() {
    if (confirm('Reset your budget? This will erase all data.')) {
      resetState();
      showScreen('setup');
      elements.setupForm.reset();
    }
  }

  function handleOpenCalendar() {
    if (!state || !state.startDate) return;
    ensureCalendarData();

    const today = getToday();
    const inRangeToday = isDateInBudgetRange(today);
    const initial = inRangeToday ? today : state.startDate;
    calendarMonthCursor = getMonthStart(initial);

    showScreen('calendar');
    renderCalendar(calendarMonthCursor);
  }

  function handleCalendarBack() {
    closeDayModal();
    showScreen('dashboard');
  }

  function handleCalendarPrevMonth() {
    if (!calendarMonthCursor) return;
    const next = addMonths(calendarMonthCursor, -1);
    calendarMonthCursor = getMonthStart(next);
    renderCalendar(calendarMonthCursor);
  }

  function handleCalendarNextMonth() {
    if (!calendarMonthCursor) return;
    const next = addMonths(calendarMonthCursor, 1);
    calendarMonthCursor = getMonthStart(next);
    renderCalendar(calendarMonthCursor);
  }

  function handleCalendarGridClick(e) {
    const btn = e.target.closest('button[data-date]');
    if (!btn) return;
    const dateStr = btn.getAttribute('data-date');
    if (!dateStr) return;
    openDayModal(dateStr);
  }

  function handleModalOverlayClick(e) {
    if (e.target === elements.dayModal) {
      closeDayModal();
    }
  }

  // ============================================
  // Initialization
  // ============================================

  function bindEvents() {
    elements.setupForm.addEventListener('submit', handleSetupSubmit);
    elements.spendForm.addEventListener('submit', handleSpendSubmit);
    elements.resetBtn.addEventListener('click', handleReset);

    if (elements.calendarBtn) elements.calendarBtn.addEventListener('click', handleOpenCalendar);
    if (elements.calendarBackBtn) elements.calendarBackBtn.addEventListener('click', handleCalendarBack);
    if (elements.calendarPrevBtn) elements.calendarPrevBtn.addEventListener('click', handleCalendarPrevMonth);
    if (elements.calendarNextBtn) elements.calendarNextBtn.addEventListener('click', handleCalendarNextMonth);
    if (elements.calendarGrid) elements.calendarGrid.addEventListener('click', handleCalendarGridClick);
    if (elements.dayModalClose) elements.dayModalClose.addEventListener('click', closeDayModal);
    if (elements.dayModal) elements.dayModal.addEventListener('click', handleModalOverlayClick);

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && elements.dayModal && !elements.dayModal.classList.contains('hidden')) {
        closeDayModal();
      }
    });
  }

  function init() {
    cacheElements();
    bindEvents();

    // Check for existing budget
    if (loadState() && state.startDate) {
      // Check if budget has expired
      if (isBudgetExpired()) {
        showToast('Your budget period has ended!', 'info');
        // Could show summary screen here
      }
      showScreen('dashboard');
      updateDashboard();
    } else {
      showScreen('setup');
    }
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
