import Database from 'better-sqlite3';
import { Database as BunDatabase } from 'bun:sqlite';
import { drizzle as drizzleBetterSqlite3 } from '~/better-sqlite3';
import { drizzle as drizzleBun } from '~/bun-sqlite';
import { drizzle as drizzleD1 } from '~/d1';

const client = new Database(':memory:');
const bunClient = new BunDatabase(':memory:');
declare const d1: D1Database;

export const db = drizzleBetterSqlite3(client);
export const bunDb = drizzleBun(bunClient);
export const d1Db = drizzleD1(d1);
