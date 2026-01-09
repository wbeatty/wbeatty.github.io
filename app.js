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
      savings: 0,
      transactions: []
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        state = JSON.parse(saved);
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

  function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDateDiff(startDate, endDate) {
    // Parse as local dates to avoid timezone issues
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
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

  // Calculate rollover from all previous days
  function calculateRollover() {
    const today = getToday();
    const dayIndex = getCurrentDayIndex();
    let rollover = 0;

    // Process each completed day
    for (let i = 0; i < dayIndex; i++) {
      const date = new Date(state.startDate + 'T00:00:00');
      date.setDate(date.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      const spent = getSpentOnDay(dateStr);
      const dayAllowance = state.dailyBase + rollover;
      const unspent = dayAllowance - spent;

      if (unspent > 0) {
        // Half rolls over to next day, half goes to savings
        rollover = unspent / 2;
        // Note: Savings are accumulated separately below
      } else {
        // Overspent - no rollover
        rollover = 0;
      }
    }

    return rollover;
  }

  // Recalculate total savings from all completed days
  function recalculateSavings() {
    const dayIndex = getCurrentDayIndex();
    let totalSavings = 0;
    let rollover = 0;

    for (let i = 0; i < dayIndex; i++) {
      const date = new Date(state.startDate + 'T00:00:00');
      date.setDate(date.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      const spent = getSpentOnDay(dateStr);
      const dayAllowance = state.dailyBase + rollover;
      const unspent = dayAllowance - spent;

      if (unspent > 0) {
        // Half to savings, half rolls over
        totalSavings += unspent / 2;
        rollover = unspent / 2;
      } else if (unspent < 0) {
        // Overspent - pull from savings
        totalSavings += unspent; // unspent is negative
        rollover = 0;
      } else {
        rollover = 0;
      }
    }

    return Math.max(0, totalSavings); // Savings can't go negative
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
    setupForm: null,
    startAmountInput: null,
    totalDaysInput: null,
    spendForm: null,
    spendAmountInput: null,
    spendNoteInput: null,
    resetBtn: null,
    todayAllowance: null,
    daysRemaining: null,
    spentToday: null,
    savingsReserve: null,
    remainingToday: null,
    remainingWrapper: null,
    progressFill: null,
    transactionsList: null
  };

  function cacheElements() {
    elements.setupScreen = document.getElementById('setup-screen');
    elements.dashboardScreen = document.getElementById('dashboard-screen');
    elements.setupForm = document.getElementById('setup-form');
    elements.startAmountInput = document.getElementById('start-amount');
    elements.totalDaysInput = document.getElementById('total-days');
    elements.spendForm = document.getElementById('spend-form');
    elements.spendAmountInput = document.getElementById('spend-amount');
    elements.spendNoteInput = document.getElementById('spend-note');
    elements.resetBtn = document.getElementById('reset-btn');
    elements.todayAllowance = document.getElementById('today-allowance');
    elements.daysRemaining = document.getElementById('days-remaining');
    elements.spentToday = document.getElementById('spent-today');
    elements.savingsReserve = document.getElementById('savings-reserve');
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

  function showScreen(screenName) {
    elements.setupScreen.classList.toggle('hidden', screenName !== 'setup');
    elements.dashboardScreen.classList.toggle('hidden', screenName !== 'dashboard');
  }

  function updateDashboard() {
    // Recalculate savings based on history
    state.savings = recalculateSavings();
    saveState();

    const allowance = getTodayAllowance();
    const spent = getSpentToday();
    const remaining = allowance - spent;
    const daysLeft = getDaysRemaining();
    const savings = state.savings;

    // Update values
    elements.todayAllowance.textContent = formatCurrency(allowance);
    elements.daysRemaining.textContent = daysLeft;
    elements.spentToday.textContent = formatCurrency(spent);
    elements.savingsReserve.textContent = formatCurrency(savings);
    
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
      savings: 0,
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

  // ============================================
  // Initialization
  // ============================================

  function bindEvents() {
    elements.setupForm.addEventListener('submit', handleSetupSubmit);
    elements.spendForm.addEventListener('submit', handleSpendSubmit);
    elements.resetBtn.addEventListener('click', handleReset);
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
