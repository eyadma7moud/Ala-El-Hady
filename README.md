# 🪙 Ala El-Hady — Personal Budget App

A clean, PIN-secured personal budgeting web app built with **pure HTML, CSS, and vanilla JavaScript** — no frameworks, no backend, no dependencies.

## ✨ Features

- 🔐 **PIN-based auth** — register & login with a 4-digit PIN, persisted via `localStorage`
- 💰 **Budget setup** — set total allowance, date range, and daily limit strategy
- 📊 **Safe Daily Limit** — auto-calculates based on remaining balance & days
- 🔄 **Rollover logic** — unspent daily funds carry over to the next day
- ⚡ **Rapid expense logging** — add expenses by amount, category & note
- 🔔 **Smart notifications** — alerts at 80% and 100% budget usage
- 📈 **Insights** — category breakdown, 7-day chart, and period timeline

## 🏗️ Architecture & Design Patterns

| Pattern | Implementation |
|---|---|
| **Singleton** | `StorageHandler` — single `localStorage` gateway |
| **Observer** | `EventBus` — dashboard auto-updates on every expense |
| **Strategy** | `DailyLimitStrategy` — switch between Simple & Weighted (80%) calculation |

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Storage:** `localStorage` (no backend required)
- **Fonts:** Playfair Display + DM Sans (Google Fonts)
- **Design:** Dark theme — Purple × Sky Blue palette


---

> Built with ❤️ by [Ala El-Hady](https://github.com/your-username)
