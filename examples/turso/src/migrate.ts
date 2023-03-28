import 'dotenv/config';

import { Database } from '@libsql/sqlite3';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { DATABASE_URL } from './env';

const client = new Database(DATABASE_URL);
const db = drizzle(client);

migrate(db, {
	migrationsFolder: './migrations',
}).then(() => {
	console.log('Migrations complete');
}).catch((err) => {
	console.error(err);
	process.exit(1);
}).finally(() => {
	client.close();
});
