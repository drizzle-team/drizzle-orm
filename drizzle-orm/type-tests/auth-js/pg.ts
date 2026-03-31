import { drizzleAdapter } from '~/auth-js/index.ts';
import { drizzle } from '~/node-postgres/index.ts';
import { pgTable, text, timestamp } from '~/pg-core/index.ts';

const pg = drizzle.mock();

// normal schema
{
	const users = pgTable('users', {
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name'),
		email: text('email').unique(),
		emailVerified: timestamp('emailVerified', { mode: 'date' }),
		image: text('image'),
	});
	drizzleAdapter(pg, { usersTable: users });
}

// missing field
{
	const users = pgTable('users', {
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name'),
		email: text('email').unique(),
		emailVerified: timestamp('emailVerified', { mode: 'date' }),
		// image: text('image'),
	});

	// @ts-expect-error
	drizzleAdapter(pg, { usersTable: users });
}

// extra field
{
	const users = pgTable('users', {
		id: text()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text(),
		email: text().unique(),
		emailVerified: timestamp('emailVerified', { mode: 'date' }),
		image: text(),
		newField: text(),
	});

	drizzleAdapter(pg, { usersTable: users });
}
