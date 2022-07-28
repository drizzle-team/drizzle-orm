import { connect, sql } from 'drizzle-orm';
import { constraint, foreignKey, index, integer, PgConnector, pgTable, serial, text, timestamp } from 'drizzle-orm-pg';
import { getTableForeignKeys } from 'drizzle-orm-pg/utils';
import { eq, exists } from 'drizzle-orm/expressions';
import { Pool } from 'pg';

const usersTable = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),
		homeCity: integer('home_city')
			.notNull()
			.references(() => citiesTable.id),
		currentCity: integer('current_city').references(() => citiesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		serialNullable: serial('serial1'),
		serialNotNull: serial('serial2').notNull(),
		class: text<'A' | 'C'>('class').notNull(),
		subClass: text<'B' | 'D'>('sub_class'),
		age1: integer('age1').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	},
	(users) => ({
		usersAge1Idx: index('usersAge1Idx', users.class, { unique: true }),
		usersAge2Idx: index('usersAge2Idx', users.class),
		uniqueClass: index('uniqueClass', [users.class, users.subClass], {
			unique: true,
			where: sql`${users.class} is not null`,
			order: 'desc',
			nulls: 'last',
			concurrently: true,
			using: sql`btree`,
		}),
		legalAge: constraint('legalAge', sql`${users.age1} > 18`),
		ageSelfFK: foreignKey(() => [users.age1, users.id]).onUpdate('no action'),
		usersClassFK: foreignKey(() => [users.class, classesTable.class]).onDelete('set default'),
		usersClassComplexFK: foreignKey(() => [
			[users.class, users.subClass],
			[classesTable.class, classesTable.subClass],
		]).onUpdate('set null').onDelete('no action'),
	}),
);

// console.log(getTableForeignKeys(usersTable));

const citiesTable = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
});

const classesTable = pgTable('classes', {
	id: serial('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text<'B' | 'D'>('sub_class').notNull(),
});

async function main() {
	const pool = new Pool({
		user: 'postgres',
		password: 'postgres',
		host: 'localhost',
		port: 5433,
		database: 'postgres',
	});
	const client = await pool.connect();
	const connector = new PgConnector(client, { usersTable, citiesTable, classesTable });
	const realDb = await connect(connector);

	await // const selectResult1 = await realDb.usersTable
	// 	.select({
	// 		id: usersTable.id,
	// 		age: usersTable.age1,
	// 	})
	// 	.innerJoin(citiesTable, eq(usersTable.homeCity, citiesTable.id), {
	// 		name: citiesTable.name,
	// 	})
	// 	.execute()
	// 	.then((result) =>
	// 		result.map(({ usersTable, citiesTable }) => ({
	// 			...usersTable,
	// 			city: citiesTable,
	// 		}))
	// 	);

	// const selectResult2 = await realDb.citiesTable.select({ id: citiesTable.id, name: citiesTable.name })
	// 	.leftJoin(usersTable, eq(usersTable.homeCity, citiesTable.id), { id: usersTable.id })
	// 	.execute()
	// 	.then((result) => {
	// 		type ResultRow = typeof result[number]['citiesTable'] & {
	// 			users: typeof result[number]['usersTable'][];
	// 		};
	// 		return Object.values(result.reduce<Record<string, ResultRow>>(
	// 			(acc, { citiesTable, usersTable }) => {
	// 				if (!(citiesTable.id in acc)) {
	// 					acc[citiesTable.id] = { ...citiesTable, users: [usersTable] };
	// 				} else {
	// 					acc[citiesTable.id]!.users.push(usersTable);
	// 				}
	// 				return acc;
	// 			},
	// 			{},
	// 		));
	// 	});

	// const selectResult3 = await realDb.usersTable.select({ id: usersTable.id }).where(exists(
	// 	realDb.citiesTable.select({ id: citiesTable.id }).whereUnsafe(eq(citiesTable.id, usersTable.homeCity)),
	// )).execute();

	client.release();
	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
