import axios from 'axios';
import { eq } from 'drizzle-orm/expressions';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { migrate } from 'drizzle-orm/pg-proxy/migrator';
import { cities, users } from './schema';

async function main() {
	const db = drizzle(async (sql, params, method) => {
		try {
			const rows = await axios.post('http://localhost:3000/query', { sql, params, method });

			return { rows: rows.data };
		} catch (e: any) {
			console.error('Error from pg proxy server:', e.response.data);
			return { rows: [] };
		}
	});

	await migrate(db, async (queries) => {
		try {
			await axios.post('http://localhost:3000/migrate', { queries });
		} catch (e) {
			console.log(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: 'drizzle' });

	const insertedCity = await db.insert(cities).values({ id: 1, name: 'name' }).returning();
	console.log('insertedCity:', insertedCity);

	const insertedUser = await db.insert(users).values({ id: 1, name: 'name', email: 'email', cityId: 1 });
	console.log('insertedUser:', insertedUser);

	const usersToCityResponse = await db.select().from(users).leftJoin(cities, eq(users.cityId, cities.id));
	console.log('usersToCityResponse:', usersToCityResponse);
}

main();
