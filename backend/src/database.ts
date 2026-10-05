import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client.js';
import { DATABASE_URL } from './databaseConfig.js';

export function createDatabase(url = DATABASE_URL) {
    const adapter = new PrismaBetterSqlite3({ url }, {
        // Existing databases store Prisma DateTime values as Unix milliseconds.
        timestampFormat: 'unixepoch-ms',
    });
    return new PrismaClient({ adapter });
}
