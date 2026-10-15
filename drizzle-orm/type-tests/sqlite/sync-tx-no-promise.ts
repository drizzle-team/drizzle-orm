import type { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';

const syncDb = {} as SQLiteAsyncDatabase<'sync', never>;

// @ts-expect-error
syncDb.transaction(async (tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));

syncDb.transaction((tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));

const asyncDb = {} as SQLiteAsyncDatabase<'async', never>;

asyncDb.transaction(async (tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));

asyncDb.transaction((tx) => tx.get<{ one: 1 }>('SELECT 1 as one;'));
