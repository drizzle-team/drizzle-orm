import type { BaseSQLiteDatabase } from '~/sqlite-core/db';

const syncDb = {} as BaseSQLiteDatabase<'sync', never>;

// @ts-expect-error
syncDb.transaction(async (tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));

syncDb.transaction((tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));

const asyncDb = {} as BaseSQLiteDatabase<'async', never>;

asyncDb.transaction(async (tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));

asyncDb.transaction((tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));
