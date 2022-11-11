import Database from 'better-sqlite3';

import { SQLiteConnector } from '~/index';

const client = new Database(':memory:');

export const db = new SQLiteConnector(client).connect();
