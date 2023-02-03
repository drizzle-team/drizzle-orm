import axios from 'axios';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { users } from './schema';

async function main() {
	const db = drizzle(async (sql, params, method) => {
		try {
			const rows = await axios.post('http://localhost:3000/query', { sql, params, method });

			return { rows: rows.data };
		} catch (e: any) {
			console.error('Error from sqlite proxy server: ', e.response.data)
			return { rows: [] };
		}
	});

	await migrate(db, async (queries) => {
		try {
			await axios.post('http://localhost:3000/migrate', { queries });
		} catch (e) {
			console.log(e)
			throw Error('Proxy server cannot run migrations')
		}
	}, { migrationsFolder: 'drizzle' });

	const insertResult = await db.insert(users).values({ id: 1, name: 'name', email: 'email' }).run();
	console.log(insertResult)

	const usersResponse = await db.select(users).all();
	console.log(usersResponse);
}

main();