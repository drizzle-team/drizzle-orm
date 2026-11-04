const { integer, pgTable, text } = require('drizzle-orm/pg-core');
const { generateDrizzleJson, generateMigration } = require('drizzle-kit/api-postgres');

async function main() {
	const users = pgTable('users', { id: integer().primaryKey(), name: text().notNull() });
	const empty = await generateDrizzleJson({});
	const current = await generateDrizzleJson({ users });
	console.log(JSON.stringify(await generateMigration(empty, current)));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
