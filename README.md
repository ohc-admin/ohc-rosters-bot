# OHC Rosters Bot

Discord bot to manage and display OHC rosters:
- Per-team embeds with **role icon** thumbnails
- Persistent **Roster Board** channel (auto-updates)
- Captain-of-own-team enforcement + **Paid Member** gate
- `/rosters show`, `/rosters export`
- `/roster add|remove|setrole|replace`
- SQLite audit logging + snapshots (`DB_PATH`)

## Setup
1. Create a bot in the Discord Dev Portal and enable **Server Members Intent**.
2. Fill `.env` from `.env.example` (use **literal numeric IDs**).
3. Install & run locally:
   ```bash
   npm i
   npm start
