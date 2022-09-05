import { connect, sql } from 'drizzle-orm';
import { float, mysqlTable, serial, text, timestamp, varchar } from 'drizzle-orm-mysql';
import { MySqlTestConnector } from 'drizzle-orm-mysql/testing';

const places = mysqlTable('places', {
	slug: varchar('slug', 100).notNull().primaryKey(),
	name: text('name').notNull(),
	address: text('address').notNull(),
	description: text('description').notNull().default(''),
	lat: float('lat').notNull(),
	lng: float('lng').notNull(),
	createdAt: timestamp('created_at')
		.notNull()
		.default(sql`now()`),
});

const placesImages = mysqlTable('places_images', {
	id: varchar('id').primaryKey(),
	placeSlug: varchar('place_slug', 100).notNull(),
	url: text('url').notNull(),
	createdAt: timestamp('created_at')
		.notNull()
		.default(sql`now()`),
	index: serial('index'),
});

async function main() {
	const db = await connect(new MySqlTestConnector({ places, placesImages }));
	await db.placesImages.insert([
		{ id: '1', placeSlug: '1', url: 'https://placehold.it/300x300' },
		{ id: '2', placeSlug: '2', url: 'https://placehold.it/300x300' },
		{ id: '3', placeSlug: '3', url: 'https://placehold.it/300x300' },
		{ id: '4', placeSlug: '4', url: 'https://placehold.it/300x300' },
	]).execute();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
