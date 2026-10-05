import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const applicationDirectory = fileURLToPath(new URL('../', import.meta.url));
const envFile = resolve(applicationDirectory, '.env');
if (existsSync(envFile)) loadEnvFile(envFile);

export function resolveDatabaseUrl(value = 'file:./data/perplexed.db') {
    if (!value.startsWith('file:') || value.length === 5)
        throw new Error('DATABASE_URL must be a local SQLite file URL');

    return `file:${resolve(applicationDirectory, value.slice(5))}`;
}

export const DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);
