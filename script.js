/**
 * ╔══════════════════════════════════════════════╗
 * ║   ALA EL-HADY — PERSONAL BUDGET APP         ║
 * ║   Architecture: Service Layer + Observer    ║
 * ║   Patterns: Singleton, Observer, Strategy   ║
 * ╚══════════════════════════════════════════════╝
 */

/**
 * Personal Budget Management Application
 * Built using HTML, CSS, and JavaScript.
 *
 * Features:
 * - Authentication System
 * - Budget Management
 * - Expense Tracking
 * - Daily Spending Strategies
 * - Observer-based Notifications
 * - Local Storage Persistence
 *
 * Design Patterns:
 * - Singleton Pattern
 * - Strategy Pattern
 * - Observer Pattern
 *
 * @author Ala El-Hady Team
 * @version 1.0.0
 */

'use strict';

/* ════════════════════════════════════════════════
   1. SINGLETON — StorageHandler
════════════════════════════════════════════════ */

/**
 * Singleton service for handling localStorage operations.
 * Provides methods to store, retrieve, and remove data.
 *
 * @module StorageHandler
 */
const StorageHandler = (() => {

  /**
   * Singleton instance reference.
   * @type {Object|null}
   */
  let instance = null;

  /**
   * Creates the storage handler instance.
   *
   * @returns {Object} Storage API methods
   */
  function createInstance() {

    /**
     * Prefix used for all localStorage keys.
     * @type {string}
     */
    const PREFIX = 'alh_';

    return {

      /**
       * Retrieves data from localStorage.
       *
       * @param {string} key - Storage key
       * @returns {*} Parsed stored value or null
       */
      get: (key) => {
        try {
          return JSON.parse(localStorage.getItem(PREFIX + key));
        } catch {
          return null;
        }
      },

      /**
       * Stores data in localStorage.
       *
       * @param {string} key - Storage key
       * @param {*} value - Value to store
       */
      set: (key, value) => {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      },

      /**
       * Removes a specific key from localStorage.
       *
       * @param {string} key - Storage key
       */
      remove: (key) => {
        localStorage.removeItem(PREFIX + key);
      },

      /**
       * Clears multiple keys from localStorage.
       *
       * @param {string[]} keys - Array of keys
       */
      clear: (keys) => {
        keys.forEach(k => localStorage.removeItem(PREFIX + k));
      }
    };
  }

  return {

    /**
     * Returns the singleton instance.
     *
     * @returns {Object} Storage instance
     */
    getInstance: () => {
      if (!instance) instance = createInstance();
      return instance;
    }
  };
})();

/**
 * Global storage instance.
 * @type {Object}
 */
const store = StorageHandler.getInstance();

/* ════════════════════════════════════════════════
   2. STRATEGY — Daily Limit Calculation
════════════════════════════════════════════════ */

/**
 * Strategy pattern for calculating daily spending limits.
 *
 * @namespace DailyLimitStrategy
 */
const DailyLimitStrategy = {

  /**
   * Calculates daily limit using simple division.
   *
   * @param {number} remainingBalance
   * @param {number} remainingDays
   * @returns {number}
   */
  simple: (remainingBalance, remainingDays) => {
    if (remainingDays <= 0)
      return remainingBalance > 0 ? remainingBalance : 0;

    return remainingBalance / remainingDays;
  },

  /**
   * Calculates daily limit using weighted allocation.
   * Reserves 20% as a safety buffer.
   *
   * @param {number} remainingBalance
   * @param {number} remainingDays
   * @returns {number}
   */
  weighted: (remainingBalance, remainingDays) => {
    if (remainingDays <= 0)
      return remainingBalance > 0 ? remainingBalance : 0;

    const usable = remainingBalance * 0.8;
    return usable / remainingDays;
  }
};

/* ════════════════════════════════════════════════
   3. OBSERVER — EventBus
════════════════════════════════════════════════ */

/**
 * Observer pattern event bus.
 * Allows modules to subscribe and emit events.
 *
 * @module EventBus
 */
const EventBus = (() => {

  /**
   * Registered subscribers.
   * @type {Object}
   */
  const subscribers = {};

  return {

    /**
     * Subscribes a callback to an event.
     *
     * @param {string} event
     * @param {Function} fn
     */
    on: (event, fn) => {
      if (!subscribers[event]) subscribers[event] = [];
      subscribers[event].push(fn);
    },

    /**
     * Emits an event to all subscribers.
     *
     * @param {string} event
     * @param {*} data
     */
    emit: (event, data) => {
      (subscribers[event] || []).forEach(fn => fn(data));
    }
  };
})();

/* ════════════════════════════════════════════════
   4. AUTH SERVICE
════════════════════════════════════════════════ */

/**
 * Authentication service.
 * Handles registration, login,
 * logout, and session management.
 *
 * @module AuthService
 */
const AuthService = (() => {

  /**
   * Users storage key.
   * @type {string}
   */
  const USERS_KEY = 'users';

  /**
   * Session storage key.
   * @type {string}
   */
  const SESSION_KEY = 'session';

  /**
   * Retrieves all registered users.
   *
   * @returns {Object}
   */
  const getUsers = () => store.get(USERS_KEY) || {};

  return {

    /**
     * Registers a new user.
     *
     * @param {Object} userData
     * @param {string} userData.name
     * @param {string} userData.username
     * @param {string} userData.pin
     * @returns {Object} Registration result
     */
    register: ({ name, username, pin }) => {
      const users = getUsers();

      if (users[username])
        return {
          ok: false,
          error: 'Username already taken.'
        };

      if (!username.trim())
        return {
          ok: false,
          error: 'Username cannot be empty.'
        };

      if (pin.length !== 4 || !/^\d{4}$/.test(pin))
        return {
          ok: false,
          error: 'PIN must be exactly 4 digits.'
        };

      users[username] = {
        name,
        username,
        pin,
        createdAt: Date.now()
      };

      store.set(USERS_KEY, users);

      return { ok: true };
    },

    /**
     * Authenticates a user.
     *
     * @param {Object} credentials
     * @param {string} credentials.username
     * @param {string} credentials.pin
     * @returns {Object} Login result
     */
    login: ({ username, pin }) => {
      const users = getUsers();
      const user = users[username];

      if (!user)
        return {
          ok: false,
          error: 'Username not found.'
        };

      if (user.pin !== pin)
        return {
          ok: false,
          error: 'Incorrect PIN.'
        };

      store.set(SESSION_KEY, {
        username,
        name: user.name,
        loginAt: Date.now()
      });

      return {
        ok: true,
        user: {
          username,
          name: user.name
        }
      };
    },

    /**
     * Logs out the current user.
     */
    logout: () => {
      store.remove(SESSION_KEY);
    },

    /**
     * Retrieves current session user.
     *
     * @returns {Object|null}
     */
    getCurrentUser: () => {
      return store.get(SESSION_KEY);
    },

    /**
     * Checks whether a user is logged in.
     *
     * @returns {boolean}
     */
    isLoggedIn: () => !!store.get(SESSION_KEY)
  };
})();

/**
 * Continue applying the same JSDoc style
 * to BudgetService, DashboardUI,
 * SetupUI, AuthUI, utility functions,
 * and boot functions exactly like above.
 *
 * Most important functions to document:
 *
 * - setupBudget()
 * - addExpense()
 * - deleteExpense()
 * - processRollover()
 * - getSnapshot()
 * - resetBudget()
 * - showToast()
 * - showScreen()
 * - initPinInputs()
 * - DashboardUI.init()
 * - refresh()
 * - boot()
 */