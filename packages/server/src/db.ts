import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { START_CASH } from '@warbit/shared';

// carregado via require para funcionar também sob o Vitest (que não reconhece o builtin node:sqlite)
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = DatabaseSyncT;

export interface Profile {
  token: string;
  name: string;
  cash: number;
  xp: number;
  kills: number;
  deaths: number;
  wins: number;
}

/** Perfil de convidado persistido em SQLite: cash, XP e estatísticas ligados a um token. */
export class ProfileStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS profiles (
      token TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cash INTEGER NOT NULL,
      xp INTEGER NOT NULL,
      kills INTEGER NOT NULL DEFAULT 0,
      deaths INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`);
  }

  /** Carrega o perfil do token ou cria um novo com o saldo inicial (uma única vez por conta). */
  loadOrCreate(token: string | undefined, name: string): Profile {
    if (token && /^[a-f0-9]{32}$/.test(token)) {
      const row = this.db.prepare('SELECT token, name, cash, xp, kills, deaths, wins FROM profiles WHERE token = ?').get(token) as Profile | undefined;
      if (row) {
        row.name = name;
        return { ...row };
      }
    }
    const p: Profile = { token: randomBytes(16).toString('hex'), name, cash: START_CASH, xp: 0, kills: 0, deaths: 0, wins: 0 };
    this.save(p);
    return p;
  }

  save(p: Profile): void {
    this.db.prepare(`INSERT INTO profiles (token, name, cash, xp, kills, deaths, wins, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET name = excluded.name, cash = excluded.cash, xp = excluded.xp, kills = excluded.kills,
      deaths = excluded.deaths, wins = excluded.wins, updated_at = excluded.updated_at`)
      .run(p.token, p.name, Math.round(p.cash), Math.round(p.xp), p.kills, p.deaths, p.wins, Date.now());
  }

  /** Executa várias gravações numa única transação (evita um fsync por perfil). */
  batch(fn: () => void): void {
    this.db.exec('BEGIN');
    try { fn(); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  close(): void {
    this.db.close();
  }
}
