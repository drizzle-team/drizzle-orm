import { drizzle } from './src/node-postgres';
import { bigint, pgTable } from './src/pg-core';

const users = pgTable('users', {
	nums: bigint({ mode: 'number' }).array(),
});

const db = drizzle.mock();

console.log(db.insert(users).values({ nums: [10] }).toSQL());
