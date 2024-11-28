import { drizzle as nodePostgresDrizzle } from 'drizzle-orm/node-postgres';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { drizzle as postgresJsDrizzle } from 'drizzle-orm/postgres-js';
import { reset, seed } from '../src/index.ts';

const pgUsers = pgTable('users', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: text(),
	inviteId: integer('invite_id').references((): PgColumn => pgUsers.id),
});

{
	const db0 = nodePostgresDrizzle('', { schema: { users: pgUsers } });

	await seed(db0, { users: pgUsers });
	await reset(db0, { users: pgUsers });

	const db1 = nodePostgresDrizzle('');

	await seed(db1, { users: pgUsers });
	await reset(db1, { users: pgUsers });
}

{
	const db0 = pgliteDrizzle('', { schema: { users: pgUsers } });

	await seed(db0, { users: pgUsers });
	await reset(db0, { users: pgUsers });

	const db1 = pgliteDrizzle('');

	await seed(db1, { users: pgUsers });
	await reset(db1, { users: pgUsers });
}

{
	const db0 = postgresJsDrizzle('', { schema: { users: pgUsers } });

	await seed(db0, { users: pgUsers });
	await reset(db0, { users: pgUsers });

	const db1 = postgresJsDrizzle('');

	await seed(db1, { users: pgUsers });
	await reset(db1, { users: pgUsers });
}
