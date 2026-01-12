import { PGlite } from '@electric-sql/pglite';
import { integer, pgTable, serial, text, timestamp } from '~/pg-core';
import { drizzle } from '~/pglite';
import { defineRelations } from '~/relations';
import { jitArrayRowMapper, jitRowMapper } from '~/row-mappers';

const users = pgTable('rqb_users_7', {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

const posts = pgTable('rqb_posts_7', {
	id: serial().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: timestamp('created_at', {
		mode: 'date',
		precision: 3,
	}).notNull(),
});

const schema = { users, posts };

const relations = defineRelations(schema, (r) => ({
	posts: {
		author: r.one.users({
			from: r.posts.userId,
			to: r.users.id,
		}),
	},
}));

async function main() {
	const client = new PGlite();

	// Test with jitRowMapper (default, object mode)
	console.log('=== Testing jitRowMapper (object mode) ===\n');
	const dbObject = drizzle({ client, schema, relations, rowMapperGenerator: jitRowMapper });

	// Create tables
	await client.query(`
		CREATE TABLE rqb_users_7 (
			id SERIAL PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			created_at TIMESTAMP(3) NOT NULL
		)
	`);

	await client.query(`
		CREATE TABLE rqb_posts_7 (
			id SERIAL PRIMARY KEY NOT NULL,
			user_id INTEGER NOT NULL,
			content TEXT,
			created_at TIMESTAMP(3) NOT NULL
		)
	`);

	const date = new Date(120000);

	await dbObject.insert(users).values([
		{ id: 1, createdAt: date, name: 'First' },
		{ id: 2, createdAt: date, name: 'Second' },
	]);

	await dbObject.insert(posts).values([
		{ id: 1, userId: 1, createdAt: date, content: null },
		{ id: 2, userId: 1, createdAt: date, content: 'Has message this time' },
	]);

	const resultObject = await dbObject.query.posts.findMany({
		with: {
			author: true,
		},
		orderBy: {
			id: 'asc',
		},
	});

	console.log('Result (jitRowMapper):');
	console.log(JSON.stringify(resultObject, null, 2));

	// Test with jitArrayRowMapper (array mode)
	console.log('\n=== Testing jitArrayRowMapper (array mode) ===\n');
	const dbArray = drizzle({ client, schema, relations, rowMapperGenerator: jitArrayRowMapper });

	const resultArray = await dbArray.query.posts.findMany({
		with: {
			author: true,
		},
		orderBy: {
			id: 'asc',
		},
	});

	console.log('Result (jitArrayRowMapper):');
	console.log(JSON.stringify(resultArray, null, 2));

	// Compare results
	console.log('\n=== Comparison ===');
	console.log('Results match:', JSON.stringify(resultObject) === JSON.stringify(resultArray));
}

main().catch(console.error);
