import { drizzleAdapter } from '~/auth-js/index.ts';
import { mysqlTable, timestamp, varchar } from '~/mysql-core/index.ts';
import { drizzle } from '~/mysql2/index.ts';

const mysql = drizzle.mock();

{
	const users = mysqlTable('user', {
		id: varchar('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: varchar('name', { length: 255 }),
		email: varchar('email', { length: 255 }).unique(),
		emailVerified: timestamp('emailVerified', { mode: 'date', fsp: 3 }),
		image: varchar('image', { length: 255 }),
	});
	drizzleAdapter(mysql, { usersTable: users });
}

{
	const users = mysqlTable('user', {
		id: varchar('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: varchar('name', { length: 255 }),
		email: timestamp('email', { mode: 'string' }).unique(), // wrong type
		emailVerified: timestamp('emailVerified', { mode: 'date', fsp: 3 }),
		image: varchar('image', { length: 255 }),
	});

	// @ts-expect-error
	drizzleAdapter(mysql, { usersTable: users });

	const users2 = mysqlTable('user', {
		id: varchar('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: varchar('name', { length: 255 }),
		email: varchar('email', { length: 255 }).unique(),
		emailVerified: timestamp('emailVerified', { mode: 'string', fsp: 3 }), // wrong mode
		image: varchar('image', { length: 255 }),
	});
	// @ts-expect-error
	drizzleAdapter(mysql, { usersTable: users2 });
}

{
	const users = mysqlTable('user', {
		id: varchar('id', { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: varchar('name', { length: 255 }),
		email: varchar('email', { length: 255 }).unique(),
		emailVerified: timestamp('emailVerified', { mode: 'date', fsp: 3 }),
		image: varchar('image', { length: 255 }),
		newField: varchar('new_field', { length: 200 }),
	});
	drizzleAdapter(mysql, { usersTable: users });
}
