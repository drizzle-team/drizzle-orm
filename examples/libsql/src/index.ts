import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { users } from './schema';

async function main() {
	const connectionString = process.env['LIBSQL_CONNECTION_STRING'];
        if (!connectionString) {
                throw new Error('LIBSQL_CONNECTION_STRING is not set');
        }
	const config = {
       		url: connectionString,
        };
	const client = createClient(config);
	const db = drizzle(client, { logger: true });

	// FIXME: run drizzle-kit, but it is not working ATM
	await db.run(sql`drop table if exists ${users}`);
	// FIXME: should we throw if this fails? right now this just returns
	// the libsql success: false thing
	await db.run(sql`
		create table ${users} (
			id integer primary key,
			name text not null,
			email text not null
		)`);
	await db.insert(users).values({ name: 'Glauber Costa', email: 'glauber@glauber.costa' }).run();
	await db.insert(users).values({ name: 'Pekka Enberg', email: 'pekka@pekka.enberg' }).run();
	const result = await db.select({ name: users.name }).from(users).all();

	console.log(`Added two mock users: ${result}`);
}

main();
