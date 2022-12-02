import Database from 'better-sqlite3';
import { Database as BunDatabase } from 'bun:sqlite';

import { SQLiteBunConnector } from '~/bun';
import { D1Connector } from '~/d1';
import { SQLiteConnector } from '~/index';

const client = new Database(':memory:');
const bunClient = new BunDatabase(':memory:');
declare const d1: D1Database;

export const db = new SQLiteConnector(client).connect();
export const bunDb = new SQLiteBunConnector(bunClient).connect();
export const d1Db = new D1Connector(d1).connect();
