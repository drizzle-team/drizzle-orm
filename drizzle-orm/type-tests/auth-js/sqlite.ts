import { drizzleAdapter } from '~/auth-js/index.ts';
import { drizzle } from '~/better-sqlite3/index.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';

const sqlite = drizzle.mock();

{
	const users = sqliteTable('user', {
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name'),
		email: text('email').unique(),
		emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
		image: text('image'),
	});
	drizzleAdapter(sqlite, { usersTable: users });
}

{
	const users = sqliteTable('user', {
		id: text('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name', { length: 255 }),
		email: integer('email', { mode: 'number' }).unique(), // wrong type
		emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
		image: text('image', { length: 255 }),
	});

	// @ts-expect-error
	drizzleAdapter(mysql, { usersTable: users });

	const users2 = sqliteTable('user', {
		id: text('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name', { length: 255 }),
		email: text('email', { length: 255 }).unique(),
		emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }), // wrong mode
		image: text('image', { length: 255 }),
	});
	// @ts-expect-error
	drizzleAdapter(mysql, { usersTable: users2 });
}

{
	const users = sqliteTable('user', {
		id: text('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name', { length: 255 }),
		email: text('email', { length: 255 }).unique(),
		emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
		image: text('image', { length: 255 }),
		newField: text('new_field', { length: 200 }),
	});
	drizzleAdapter(sqlite, { usersTable: users });
}
