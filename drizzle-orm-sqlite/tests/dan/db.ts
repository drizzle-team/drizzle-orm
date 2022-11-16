import Database from 'better-sqlite3';
import { Database as BunDatabase } from 'bun:sqlite';
import { Database as AsyncDatabase } from 'sqlite3';

import { SQLite3Connector } from '~/async';
import { SQLiteBunConnector } from '~/bun';
import { SQLiteConnector } from '~/index';

const client = new Database(':memory:');
const bunClient = new BunDatabase(':memory:');
const asyncClient = new AsyncDatabase(':memory:');

export const db = new SQLiteConnector(client).connect();
export const bunDb = new SQLiteBunConnector(bunClient).connect();
export const asyncDb = new SQLite3Connector(asyncClient).connect();
