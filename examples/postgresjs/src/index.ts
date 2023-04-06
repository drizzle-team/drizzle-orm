import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { user } from './schema';

const migrationConnection = postgres(process.env.DATABASE_URL!, { max: 1 });
const queryConnection = postgres(process.env.DATABASE_URL!);

const db = drizzle(queryConnection);

const main = async () => {
	await migrate(drizzle(migrationConnection), { migrationsFolder: 'drizzle' });
	await migrationConnection.end();

	// await db.insert(user).values([{ name: 'alef' }, { name: 'bolk' }]);
	console.log(await db.select().from(user));
	process.exit(0);
};

main();
