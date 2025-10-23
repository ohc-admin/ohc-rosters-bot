# OHC Rosters Bot

Discord bot to manage and display team rosters:
- `/rosters show [team]` — per-team embeds with **role icon** thumbnails
- `/rosters export` — CSV export of all rosters
- `/roster add|remove|setrole|replace` — for **Team Captains of that team** (or Admins)
- Excludes Free Agents (roles containing `FA` or `Free Agent`)
- Requires **Paid Member** to add/set/replace incoming members
- Keeps a persistent **Roster Board** channel up-to-date (one message per team)

## Prereqs
- Node 18+
- A Discord bot with **Server Members Intent** enabled

## Setup
1. Clone and install
   ```bash
   git clone <your-repo-url>.git
   cd ohc-rosters-bot
   npm i
