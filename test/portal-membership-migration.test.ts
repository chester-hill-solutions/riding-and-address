import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const initial = readFileSync(new URL('../portal/migrations/0001_init.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../portal/migrations/0003_workspace_member_uniqueness.sql', import.meta.url), 'utf8');

function oldDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(initial);
  db.exec(`INSERT INTO workspace(id,name,slug) VALUES ('a','Customer A','a'),('b','Customer B','b');
    INSERT INTO workspace_member(id,workspace_id,user_id,role_id) VALUES ('first','a','user','owner');`);
  return db;
}

describe('portal membership uniqueness migration', () => {
  it('refuses conflicting duplicate principals without removing or selecting a role', () => {
    const db = oldDatabase();
    try {
      db.exec(`INSERT INTO workspace_member(id,workspace_id,user_id,role_id) VALUES ('second','a','user','member')`);
      const before = db.prepare('SELECT * FROM workspace_member ORDER BY id').all();
      expect(() => db.exec(migration)).toThrow(/UNIQUE/);
      expect(db.prepare('SELECT * FROM workspace_member ORDER BY id').all()).toEqual(before);
    } finally { db.close(); }
  });

  it('is idempotent and scopes uniqueness to the Customer and user pair', () => {
    const db = oldDatabase();
    try {
      db.exec(migration);
      db.exec(migration);
      expect(() => db.exec(`INSERT INTO workspace_member(id,workspace_id,user_id,role_id) VALUES ('duplicate','a','user','member')`)).toThrow(/UNIQUE/);
      db.exec(`INSERT INTO workspace_member(id,workspace_id,user_id,role_id) VALUES
        ('other-customer','b','user','member'), ('other-user','a','other','member')`);
      expect(db.prepare('SELECT count(*) AS count FROM workspace_member').get()?.count).toBe(3);
    } finally { db.close(); }
  });
});
