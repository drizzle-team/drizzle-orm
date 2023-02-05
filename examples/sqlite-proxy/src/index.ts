import axios from 'axios';
import { eq } from 'drizzle-orm/expressions';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { cities, users } from './schema';

async function main() {
	const db = drizzle(async (sql, params, method) => {
		try {
			const rows = await axios.post('http://localhost:3000/query', { sql, params, method });

			return { rows: rows.data };
		} catch (e: any) {
			console.error('Error from sqlite proxy server: ', e.response.data);
			return { rows: [] };
		}
	});

	await migrate(db, async (queries) => {
		try {
			await axios.post('http://localhost:3000/migrate', { queries });
		} catch (e) {
			console.log(e);
			throw Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: 'drizzle' });

	const insertedCity = await db.insert(cities).values({ id: 1, name: 'name' }).returning().get();
	console.log('insertedCity: ', insertedCity);

	const insertedUser = await db.insert(users).values({ id: 1, name: 'name', email: 'email', cityId: 1 }).run();
	console.log('insertedUser: ', insertedUser);

	const usersToCityResponse = await db.select(users).leftJoin(cities, eq(users.cityId, cities.id)).get();
	console.log('usersToCityResponse: ', usersToCityResponse);
}

main();
