import { connect } from 'drizzle-orm';
import path from 'path';

import { SQLiteConnector } from '~/connection';

import Database from 'better-sqlite3';

const client = new Database(path.resolve(__dirname, '../database.db'));
import { SQLiteTestConnector } from '~/testing';
import { cities, classes, users } from './tables';

export const db = await connect(new SQLiteTestConnector({ users, cities, classes }));
export const realDb = await connect(new SQLiteConnector(client, { users, cities, classes }));
