/**
 * ╔══════════════════════════════════════════════╗
 * ║   ALA EL-HADY — PERSONAL BUDGET APP          ║
 * ║   Architecture: Service Layer + Observer     ║
 * ║   Patterns: Singleton, Observer, Strategy    ║
 * ╚══════════════════════════════════════════════╝
 */

'use strict';

/* ════════════════════════════════════════════════
   1. SINGLETON — StorageHandler
   Single point of truth for all localStorage ops
════════════════════════════════════════════════ */
const StorageHandler = (() => {
  let instance = null;

  function createInstance() {
    const PREFIX = 'alh_';
    return {
      get: (key) => {
        try { return JSON.parse(localStorage.getItem(PREFIX + key)); }
        catch { return null; }
      },
      set: (key, value) => {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      },
      remove: (key) => {
        localStorage.removeItem(PREFIX + key);
      },
      clear: (keys) => {
        keys.forEach(k => localStorage.removeItem(PREFIX + k));
      }
    };
  }

  return {
    getInstance: () => {
      if (!instance) instance = createInstance();
      return instance;
    }
  };
})();

const store = StorageHandler.getInstance();

/* ════════════════════════════════════════════════
   2. STRATEGY — Daily Limit Calculation
════════════════════════════════════════════════ */
const DailyLimitStrategy = {
  simple: (remainingBalance, remainingDays) => {
    if (remainingDays <= 0) return remainingBalance > 0 ? remainingBalance : 0;
    return remainingBalance / remainingDays;
  },
  weighted: (remainingBalance, remainingDays) => {
    // Reserve 20% as safety buffer; only use 80% for daily allocation
    if (remainingDays <= 0) return remainingBalance > 0 ? remainingBalance : 0;
    const usable = remainingBalance * 0.8;
    return usable / remainingDays;
  }
};

/* ════════════════════════════════════════════════
   3. OBSERVER — EventBus
   Dashboard & Notifications subscribe to events
════════════════════════════════════════════════ */
const EventBus = (() => {
  const subscribers = {};
  return {
    on: (event, fn) => {
      if (!subscribers[event]) subscribers[event] = [];
      subscribers[event].push(fn);
    },
    emit: (event, data) => {
      (subscribers[event] || []).forEach(fn => fn(data));
    }
  };
})();

/* ════════════════════════════════════════════════
   4. AUTH SERVICE
════════════════════════════════════════════════ */
const AuthService = (() => {
  const USERS_KEY = 'users';
  const SESSION_KEY = 'session';

  const getUsers = () => store.get(USERS_KEY) || {};

  return {
    register: ({ name, username, pin }) => {
      const users = getUsers();
      if (users[username]) return { ok: false, error: 'Username already taken.' };
      if (!username.trim()) return { ok: false, error: 'Username cannot be empty.' };
      if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits.' };
      users[username] = { name, username, pin, createdAt: Date.now() };
      store.set(USERS_KEY, users);
      return { ok: true };
    },

    login: ({ username, pin }) => {
      const users = getUsers();
      const user = users[username];
      if (!user) return { ok: false, error: 'Username not found.' };
      if (user.pin !== pin) return { ok: false, error: 'Incorrect PIN.' };
      store.set(SESSION_KEY, { username, name: user.name, loginAt: Date.now() });
      return { ok: true, user: { username, name: user.name } };
    },

    logout: () => {
      store.remove(SESSION_KEY);
    },

    getCurrentUser: () => {
      return store.get(SESSION_KEY);
    },

    isLoggedIn: () => !!store.get(SESSION_KEY)
  };
})();

/* ════════════════════════════════════════════════
   5. BUDGET SERVICE
════════════════════════════════════════════════ */
const BudgetService = (() => {

  const getBudgetKey = (username) => `budget_${username}`;
  const getExpensesKey = (username) => `expenses_${username}`;
  const getRolloverKey = (username) => `rollover_${username}`;

  const todayStr = () => new Date().toISOString().slice(0, 10);

  return {
    /** Set up the initial budget for a user */
    setupBudget: ({ username, total, startDate, endDate, strategy }) => {
      store.set(getBudgetKey(username), { total, startDate, endDate, strategy, createdAt: Date.now() });
      store.set(getExpensesKey(username), []);
      store.set(getRolloverKey(username), { date: todayStr(), amount: 0 });
      EventBus.emit('budget:updated');
    },

    getBudget: (username) => store.get(getBudgetKey(username)),

    getExpenses: (username) => store.get(getExpensesKey(username)) || [],

    addExpense: (username, { amount, category, note }) => {
      const expenses = store.get(getExpensesKey(username)) || [];
      const expense = {
        id: Date.now().toString(),
        amount: parseFloat(amount),
        category,
        note: note || '',
        date: todayStr(),
        timestamp: Date.now()
      };
      expenses.unshift(expense);
      store.set(getExpensesKey(username), expenses);
      EventBus.emit('expense:added', expense);
      return expense;
    },

    deleteExpense: (username, id) => {
      let expenses = store.get(getExpensesKey(username)) || [];
      expenses = expenses.filter(e => e.id !== id);
      store.set(getExpensesKey(username), expenses);
      EventBus.emit('expense:added', null);
    },

    /**
     * Rollover Logic:
     * If the stored rollover date ≠ today, compute yesterday's leftover
     * (dailyLimit - yesterday's spending) and store it as today's rollover bonus.
     */
    processRollover: (username) => {
      const budget = store.get(getBudgetKey(username));
      if (!budget) return 0;

      const rolloverData = store.get(getRolloverKey(username)) || { date: todayStr(), amount: 0 };
      const today = todayStr();

      if (rolloverData.date === today) return rolloverData.amount;

      // New day — compute yesterday's rollover
      const yesterday = rolloverData.date;
      const expenses = store.get(getExpensesKey(username)) || [];
      const yesterdaySpent = expenses
        .filter(e => e.date === yesterday)
        .reduce((s, e) => s + e.amount, 0);

      const snap = BudgetService.getSnapshot(username);
      const prevDailyLimit = snap.dailyLimit;
      const rollover = Math.max(0, prevDailyLimit - yesterdaySpent);

      store.set(getRolloverKey(username), { date: today, amount: parseFloat(rollover.toFixed(2)) });
      return rollover;
    },

    getRollover: (username) => {
      const r = store.get(getRolloverKey(username));
      if (!r || r.date !== todayStr()) return 0;
      return r.amount;
    },

    /**
     * Full snapshot of budget state for a user
     */
    getSnapshot: (username) => {
      const budget = store.get(getBudgetKey(username));
      if (!budget) return null;

      const expenses = store.get(getExpensesKey(username)) || [];
      const today = todayStr();

      const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
      const remaining = Math.max(0, budget.total - totalSpent);

      const startDate = new Date(budget.startDate);
      const endDate = new Date(budget.endDate);
      const todayDate = new Date(today);

      const totalDays = Math.max(1, Math.ceil((endDate - startDate) / 86400000) + 1);
      const daysPassed = Math.max(0, Math.ceil((todayDate - startDate) / 86400000));
      const remainingDays = Math.max(0, totalDays - daysPassed);

      const strategyFn = DailyLimitStrategy[budget.strategy] || DailyLimitStrategy.simple;
      const dailyLimit = strategyFn(remaining, remainingDays);

      const todaySpent = expenses.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0);
      const rollover = BudgetService.getRollover(username);

      const pctUsed = budget.total > 0 ? (totalSpent / budget.total) * 100 : 0;
      const timelinePct = totalDays > 0 ? Math.min(100, (daysPassed / totalDays) * 100) : 0;

      return {
        budget,
        totalSpent,
        remaining,
        dailyLimit,
        todaySpent,
        rollover,
        remainingDays,
        totalDays,
        daysPassed,
        pctUsed,
        timelinePct,
        strategy: budget.strategy
      };
    },

    resetBudget: (username) => {
      store.remove(getBudgetKey(username));
      store.remove(getExpensesKey(username));
      store.remove(getRolloverKey(username));
      EventBus.emit('budget:reset');
    },

    hasBudget: (username) => !!store.get(getBudgetKey(username))
  };
})();

/* ════════════════════════════════════════════════
   6. UI UTILITIES
════════════════════════════════════════════════ */
const fmt = (n) => {
  const num = parseFloat(n) || 0;
  return 'EGP ' + num.toLocaleString('en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const fmtShort = (n) => {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const CATEGORY_EMOJI = {
  Food: '🍔', Transport: '🚌', Shopping: '🛍️',
  Entertainment: '🎬', Health: '💊', Bills: '💡',
  Education: '📚', Other: '📦'
};

const CATEGORY_COLORS = [
  '#7C3AED', '#38BDF8', '#8B5CF6', '#06B6D4',
  '#A78BFA', '#0EA5E9', '#C4B5FD', '#7DD3FC'
];

let toastTimer = null;
const showToast = (msg) => {
  const t = document.getElementById('toast');
  const tm = document.getElementById('toast-message');
  tm.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
};

const showScreen = (id) => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};

const showError = (id, msg) => {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
};

const clearError = (id) => document.getElementById(id).classList.add('hidden');

/* ════════════════════════════════════════════════
   7. PIN INPUT HELPERS
════════════════════════════════════════════════ */
const initPinInputs = (containerId) => {
  const boxes = document.querySelectorAll(`#${containerId} .pin-box`);
  boxes.forEach((box, i) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      box.value = val ? val[0] : '';
      if (val && i < boxes.length - 1) boxes[i + 1].focus();
      box.classList.toggle('filled', !!box.value);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].value = '';
        boxes[i - 1].classList.remove('filled');
        boxes[i - 1].focus();
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      paste.split('').forEach((c, j) => {
        if (boxes[j]) { boxes[j].value = c; boxes[j].classList.add('filled'); }
      });
      const next = Math.min(paste.length, boxes.length - 1);
      boxes[next].focus();
    });
  });
};

const getPinValue = (containerId) => {
  return Array.from(document.querySelectorAll(`#${containerId} .pin-box`))
    .map(b => b.value).join('');
};

const clearPinInputs = (containerId) => {
  document.querySelectorAll(`#${containerId} .pin-box`).forEach(b => {
    b.value = '';
    b.classList.remove('filled');
  });
};

/* ════════════════════════════════════════════════
   8. AUTH UI
════════════════════════════════════════════════ */
const AuthUI = (() => {
  const initTabs = () => {
    const tabs = document.querySelectorAll('.auth-tab');
    const indicator = document.querySelector('.tab-indicator');
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        indicator.style.transform = i === 0 ? 'translateX(0)' : 'translateX(100%)';
        document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`${tab.dataset.tab}-panel`).classList.add('active');
        clearError('login-error');
        clearError('register-error');
      });
    });
  };

  const initLogin = () => {
    document.getElementById('login-btn').addEventListener('click', () => {
      const username = document.getElementById('login-username').value.trim();
      const pin = getPinValue('login-pin-inputs');
      if (!username) { showError('login-error', 'Please enter your username.'); return; }
      if (pin.length !== 4) { showError('login-error', 'Please enter all 4 PIN digits.'); return; }

      const result = AuthService.login({ username, pin });
      if (!result.ok) { showError('login-error', result.error); clearPinInputs('login-pin-inputs'); return; }

      onLoginSuccess(result.user);
    });
    // Allow enter key on username input
    document.getElementById('login-username').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.querySelectorAll('#login-pin-inputs .pin-box')[0].focus();
    });
  };

  const initRegister = () => {
    document.getElementById('register-btn').addEventListener('click', () => {
      const name = document.getElementById('reg-name').value.trim();
      const username = document.getElementById('reg-username').value.trim().toLowerCase();
      const pin = getPinValue('reg-pin-inputs');
      if (!name) { showError('register-error', 'Please enter your name.'); return; }
      if (!username) { showError('register-error', 'Please choose a username.'); return; }
      if (pin.length !== 4) { showError('register-error', 'Please enter all 4 PIN digits.'); return; }

      const result = AuthService.register({ name, username, pin });
      if (!result.ok) { showError('register-error', result.error); return; }

      showToast('Account created! Please sign in.');
      // Switch to login tab
      document.querySelectorAll('.auth-tab')[0].click();
      document.getElementById('login-username').value = username;
      clearPinInputs('reg-pin-inputs');
    });
  };

  return {
    init: () => {
      initTabs();
      initPinInputs('login-pin-inputs');
      initPinInputs('reg-pin-inputs');
      initLogin();
      initRegister();
    }
  };
})();

/* ════════════════════════════════════════════════
   9. SETUP UI
════════════════════════════════════════════════ */
const SetupUI = (() => {
  let selectedStrategy = 'simple';

  const initStrategyBtns = () => {
    document.querySelectorAll('.strategy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedStrategy = btn.dataset.strategy;
      });
    });
  };

  const initSetupForm = () => {
    // Set default dates
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    document.getElementById('setup-start').value = firstOfMonth.toISOString().slice(0, 10);
    document.getElementById('setup-end').value = lastOfMonth.toISOString().slice(0, 10);

    document.getElementById('setup-btn').addEventListener('click', () => {
      const user = AuthService.getCurrentUser();
      const total = parseFloat(document.getElementById('setup-budget').value);
      const startDate = document.getElementById('setup-start').value;
      const endDate = document.getElementById('setup-end').value;

      if (!total || total <= 0) { showError('setup-error', 'Please enter a valid budget amount.'); return; }
      if (!startDate || !endDate) { showError('setup-error', 'Please select both start and end dates.'); return; }
      if (new Date(startDate) >= new Date(endDate)) { showError('setup-error', 'End date must be after start date.'); return; }

      BudgetService.setupBudget({ username: user.username, total, startDate, endDate, strategy: selectedStrategy });
      DashboardUI.init(user);
      showScreen('dashboard-screen');
    });
  };

  return {
    init: () => {
      initStrategyBtns();
      initSetupForm();
    }
  };
})();

/* ════════════════════════════════════════════════
   10. DASHBOARD UI (Observer subscriber)
════════════════════════════════════════════════ */
const DashboardUI = (() => {
  let currentUser = null;

  /* ── DATE ── */
  const updateDate = () => {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const str = now.toLocaleDateString('en-EG', opts);
    document.getElementById('today-date').textContent = str;
  };

  /* ── STAT CARDS ── */
  const updateStats = (snap) => {
    document.getElementById('stat-daily-limit').textContent = fmt(snap.dailyLimit);
    document.getElementById('stat-strategy-label').textContent =
      snap.strategy === 'weighted' ? 'Weighted (80% Rule)' : 'Simple Division';
    document.getElementById('stat-remaining').textContent = fmt(snap.remaining);
    document.getElementById('stat-days-left').textContent = `${snap.remainingDays} day${snap.remainingDays !== 1 ? 's' : ''} left`;
    document.getElementById('stat-spent').textContent = fmt(snap.totalSpent);
    document.getElementById('stat-total-budget').textContent = `of ${fmt(snap.budget.total)}`;
    document.getElementById('stat-today-spent').textContent = fmt(snap.todaySpent);
    document.getElementById('stat-rollover').textContent = `Rollover: ${fmt(snap.rollover)}`;
  };

  /* ── PROGRESS BAR ── */
  const updateProgress = (snap) => {
    const pct = Math.min(100, snap.pctUsed);
    const bar = document.getElementById('budget-progress-bar');
    bar.style.width = pct + '%';
    bar.className = 'progress-fill';
    if (pct >= 80) bar.classList.add('warning');
    if (pct >= 95) { bar.classList.remove('warning'); bar.classList.add('danger'); }
    document.getElementById('budget-pct-badge').textContent = pct.toFixed(1) + '%';
    document.getElementById('progress-label-right').textContent = fmt(snap.budget.total);
    // Update left label
    const leftLabel = document.querySelector('#view-overview .progress-labels span');
    if (leftLabel) leftLabel.textContent = fmt(snap.totalSpent) + ' spent';
  };

  /* ── NOTIFICATIONS (Observer) ── */
  const checkNotification = (snap) => {
    const banner = document.getElementById('notification-banner');
    const msg = document.getElementById('notif-message');
    if (snap.pctUsed >= 80 && snap.pctUsed < 100) {
      msg.textContent = `⚠️ You've used ${snap.pctUsed.toFixed(0)}% of your total budget!`;
      banner.classList.remove('hidden');
    } else if (snap.pctUsed >= 100) {
      msg.textContent = `🚨 You've exceeded your total budget!`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  };

  /* ── EXPENSE LIST ── */
  const renderExpenseList = (containerId, expenses, limit = null) => {
    const container = document.getElementById(containerId);
    const shown = limit ? expenses.slice(0, limit) : expenses;
    if (!shown.length) {
      container.innerHTML = '<div class="empty-state">No expenses logged yet.</div>';
      return;
    }
    container.innerHTML = shown.map(e => `
      <div class="expense-item" data-id="${e.id}">
        <div class="expense-emoji">${CATEGORY_EMOJI[e.category] || '📦'}</div>
        <div class="expense-details">
          <div class="expense-cat">${e.category}</div>
          <div class="expense-note">${e.note || '—'}</div>
        </div>
        <div class="expense-meta">
          <div class="expense-amount">${fmt(e.amount)}</div>
          <div class="expense-date">${e.date}</div>
        </div>
        <button class="btn-danger delete-btn" data-id="${e.id}">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        BudgetService.deleteExpense(currentUser.username, btn.dataset.id);
        showToast('Expense deleted.');
      });
    });
  };

  /* ── INSIGHTS ── */
  const renderInsights = (snap, expenses) => {
    // Category breakdown
    const catEl = document.getElementById('category-breakdown');
    const catMap = {};
    expenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const maxAmt = sorted[0]?.[1] || 1;

    if (!sorted.length) {
      catEl.innerHTML = '<div class="empty-state">No data yet.</div>';
    } else {
      catEl.innerHTML = sorted.map(([cat, amt], i) => `
        <div class="cat-row">
          <div class="cat-row-header">
            <span class="cat-name">${CATEGORY_EMOJI[cat] || '📦'} ${cat}</span>
            <span class="cat-amount">${fmt(amt)}</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width:${(amt/maxAmt)*100}%;background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></div>
          </div>
        </div>
      `).join('');
    }

    // Daily chart — last 7 days
    const dailyEl = document.getElementById('daily-chart');
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const spent = expenses.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0);
      days.push({ label: d.toLocaleDateString('en', { weekday: 'short' }), spent });
    }
    const maxSpent = Math.max(...days.map(d => d.spent), 1);
    dailyEl.innerHTML = days.map(d => `
      <div class="day-col">
        <div class="day-bar-wrap">
          <div class="day-bar" style="height:${Math.max(3, (d.spent / maxSpent) * 100)}px" title="${fmt(d.spent)}"></div>
        </div>
        <span class="day-label">${d.label}</span>
      </div>
    `).join('');

    // Timeline
    document.getElementById('timeline-bar').style.width = snap.timelinePct + '%';
    document.getElementById('timeline-today-marker').style.left = `calc(${snap.timelinePct}% - 9px)`;
    document.getElementById('timeline-start-label').textContent = snap.budget.startDate;
    document.getElementById('timeline-end-label').textContent = snap.budget.endDate;
  };

  /* ── MASTER REFRESH (Observer callback) ── */
  const refresh = () => {
    if (!currentUser) return;
    BudgetService.processRollover(currentUser.username);
    const snap = BudgetService.getSnapshot(currentUser.username);
    if (!snap) return;
    const expenses = BudgetService.getExpenses(currentUser.username);

    updateDate();
    updateStats(snap);
    updateProgress(snap);
    checkNotification(snap);
    renderExpenseList('recent-expenses-list', expenses, 6);
    updateAllExpensesView(expenses);
    renderInsights(snap, expenses);
    document.getElementById('expense-count-label').textContent = `${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}`;
  };

  const updateAllExpensesView = (expenses) => {
    const filter = document.getElementById('filter-category')?.value || 'all';
    const filtered = filter === 'all' ? expenses : expenses.filter(e => e.category === filter);
    renderExpenseList('all-expenses-list', filtered);
  };

  /* ── QUICK ADD EXPENSE ── */
  const initExpenseForm = () => {
    document.getElementById('add-expense-btn').addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('exp-amount').value);
      const category = document.getElementById('exp-category').value;
      const note = document.getElementById('exp-note').value.trim();

      if (!amount || amount <= 0) { showError('expense-error', 'Please enter a valid amount.'); return; }

      BudgetService.addExpense(currentUser.username, { amount, category, note });
      document.getElementById('exp-amount').value = '';
      document.getElementById('exp-note').value = '';
      showToast(`${CATEGORY_EMOJI[category]} ${category} expense logged!`);
    });
  };

  /* ── NAV ── */
  const initNav = () => {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`)?.classList.add('active');
        if (view === 'insights' || view === 'expenses') refresh();
      });
    });
  };

  /* ── FILTER ── */
  const initFilter = () => {
    document.getElementById('filter-category').addEventListener('change', () => {
      const expenses = BudgetService.getExpenses(currentUser.username);
      updateAllExpensesView(expenses);
    });
  };

  /* ── LOGOUT ── */
  const initLogout = () => {
    document.getElementById('logout-btn').addEventListener('click', () => {
      AuthService.logout();
      showScreen('auth-screen');
    });
  };

  /* ── RESET ── */
  const initReset = () => {
    document.getElementById('reset-budget-btn').addEventListener('click', () => {
      if (!confirm('Are you sure you want to reset your budget? All expense history will be deleted.')) return;
      BudgetService.resetBudget(currentUser.username);
      showScreen('setup-screen');
      showToast('Budget has been reset.');
    });
    document.getElementById('notif-close').addEventListener('click', () => {
      document.getElementById('notification-banner').classList.add('hidden');
    });
  };

  /* ── OBSERVER SUBSCRIPTIONS ── */
  EventBus.on('expense:added', refresh);
  EventBus.on('budget:updated', refresh);

  return {
    init: (user) => {
      currentUser = user;

      // Set user UI
      document.getElementById('sidebar-username').textContent = user.name || user.username;
      document.getElementById('user-avatar').textContent = (user.name || user.username)[0].toUpperCase();

      initExpenseForm();
      initNav();
      initFilter();
      initLogout();
      initReset();
      refresh();
    }
  };
})();

/* ════════════════════════════════════════════════
   11. APP BOOT
════════════════════════════════════════════════ */
const onLoginSuccess = (user) => {
  if (BudgetService.hasBudget(user.username)) {
    DashboardUI.init(user);
    showScreen('dashboard-screen');
  } else {
    showScreen('setup-screen');
  }
};

const boot = () => {
  AuthUI.init();
  SetupUI.init();

  // Check for existing session
  if (AuthService.isLoggedIn()) {
    const user = AuthService.getCurrentUser();
    onLoginSuccess(user);
  } else {
    showScreen('auth-screen');
  }
};

document.addEventListener('DOMContentLoaded', boot);
