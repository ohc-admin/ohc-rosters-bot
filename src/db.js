// src/db.js
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || '/app/data/ohc_rosters.db';

// Ensure parent dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Open DB
const db = new Database(DB_PATH);

// Pragmas tuned for Docker + Synology bind mounts
db.pragma('journal_mode = WAL');        // better concurrency + durability
db.pragma('synchronous = NORMAL');      // good balance for WAL
db.pragma('busy_timeout = 5000');       // wait up to 5s if DB is busy
db.pragma('wal_autocheckpoint = 1000'); // checkpoint every ~1000 pages
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                  -- Date.now()
  actor_id TEXT NOT NULL,               -- command invoker
  action TEXT NOT NULL,                 -- add|remove|setrole|replace|export
  team_role_id TEXT,
  target_id TEXT,                       -- affected member (or OUT for replace)
  other_id TEXT,                        -- IN member for replace
  as_tag TEXT,                          -- player|coach|null
  notes TEXT
);

CREATE TABLE IF NOT EXISTS roster_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  team_role_id TEXT NOT NULL,
  payload TEXT NOT NULL                 -- JSON { teamName, teamRoleId, members:[...] }
);

-- Helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_team ON audit_logs (team_role_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_team_ts ON roster_snapshots (team_role_id, ts DESC);
`);

// Prepared statements
const insertAudit = db.prepare(`
  INSERT INTO audit_logs (ts, actor_id, action, team_role_id, target_id, other_id, as_tag, notes)
  VALUES (@ts, @actor_id, @action, @team_role_id, @target_id, @other_id, @as_tag, @notes)
`);

const insertSnapshot = db.prepare(`
  INSERT INTO roster_snapshots (ts, team_role_id, payload)
  VALUES (@ts, @team_role_id, @payload)
`);

// Public API
export function logAudit({
  actorId, action, teamRoleId = null, targetId = null, otherId = null, asTag = null, notes = null
}) {
  insertAudit.run({
    ts: Date.now(),
    actor_id: String(actorId ?? ''),
    action: String(action),
    team_role_id: teamRoleId != null ? String(teamRoleId) : null,
    target_id: targetId != null ? String(targetId) : null,
    other_id: otherId != null ? String(otherId) : null,
    as_tag: asTag ?? null,
    notes: notes ?? null
  });
}

export function saveRosterSnapshot(teamRoleId, payloadObj) {
  insertSnapshot.run({
    ts: Date.now(),
    team_role_id: String(teamRoleId),
    payload: JSON.stringify(payloadObj)
  });
}

// Handy helpers (optional, useful for admin commands)
export function getRecentAudits(limit = 25) {
  return db.prepare(`SELECT * FROM audit_logs ORDER BY ts DESC LIMIT ?`).all(limit);
}

export function getLatestSnapshot(teamRoleId) {
  return db.prepare(`
    SELECT payload, ts FROM roster_snapshots
    WHERE team_role_id = ?
    ORDER BY ts DESC LIMIT 1
  `).get(String(teamRoleId));
}

// Graceful shutdown (avoid WAL issues on container stop)
function closeDb() {
  try { db.close(); } catch { /* ignore */ }
}
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

// (Optional) export db for tests/tools
export { db, DB_PATH };
