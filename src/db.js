import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || '/app/data/ohc_rosters.db';

// Ensure the parent directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Minimal schema: audit trail + optional snapshots
db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,           -- add|remove|setrole|replace|export
  team_role_id TEXT,
  target_id TEXT,                 -- affected member (or OUT for replace)
  other_id TEXT,                  -- IN member for replace
  as_tag TEXT,                    -- player|coach|null
  notes TEXT
);

CREATE TABLE IF NOT EXISTS roster_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  team_role_id TEXT NOT NULL,
  payload TEXT NOT NULL           -- JSON: {teamName, teamRoleId, members:[{id,name,isCoach,isPlayer}]}
);
`);

const insertAudit = db.prepare(`
  INSERT INTO audit_logs (ts, actor_id, action, team_role_id, target_id, other_id, as_tag, notes)
  VALUES (@ts, @actor_id, @action, @team_role_id, @target_id, @other_id, @as_tag, @notes)
`);

export function logAudit({ actorId, action, teamRoleId = null, targetId = null, otherId = null, asTag = null, notes = null }) {
  insertAudit.run({
    ts: Date.now(),
    actor_id: String(actorId ?? ''),
    action: String(action),
    team_role_id: teamRoleId ? String(teamRoleId) : null,
    target_id: targetId ? String(targetId) : null,
    other_id: otherId ? String(otherId) : null,
    as_tag: asTag,
    notes
  });
}

const insertSnapshot = db.prepare(`
  INSERT INTO roster_snapshots (ts, team_role_id, payload)
  VALUES (@ts, @team_role_id, @payload)
`);

export function saveRosterSnapshot(teamRoleId, payloadObj) {
  insertSnapshot.run({
    ts: Date.now(),
    team_role_id: String(teamRoleId),
    payload: JSON.stringify(payloadObj)
  });
}
