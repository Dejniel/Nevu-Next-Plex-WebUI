import Sqlite from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DATABASE_PATH } from './databaseConfig.js';

interface UserOption {
    userUid: string;
    key: string;
    value: string;
}

export function createDatabase(filename = DATABASE_PATH) {
    mkdirSync(dirname(filename), { recursive: true });
    const sqlite = new Sqlite(filename);
    try {
        sqlite.pragma('journal_mode = WAL');
        sqlite.exec(`CREATE TABLE IF NOT EXISTS UserOption (
            userUid TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (userUid, key)
        )`);
        const list = sqlite.prepare<[string], UserOption>(
            'SELECT userUid, key, value FROM UserOption WHERE userUid = ? ORDER BY key',
        );
        const get = sqlite.prepare<[string, string], UserOption>(
            'SELECT userUid, key, value FROM UserOption WHERE userUid = ? AND key = ?',
        );
        const set = sqlite.prepare<[string, string, string], UserOption>(`
            INSERT INTO UserOption (userUid, key, value) VALUES (?, ?, ?)
            ON CONFLICT (userUid, key) DO UPDATE SET value = excluded.value
            RETURNING userUid, key, value
        `);
        return {
            getOptions: (userUid: string) => list.all(userUid),
            getOption: (userUid: string, key: string) => get.get(userUid, key),
            setOption: (userUid: string, key: string, value: string) => set.get(userUid, key, value)!,
            close: () => sqlite.close(),
        };
    } catch (error) {
        sqlite.close();
        throw error;
    }
}

export type UserOptionsDatabase = ReturnType<typeof createDatabase>;
