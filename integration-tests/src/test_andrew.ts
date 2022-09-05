import { connect, sql } from 'drizzle-orm';
import { bigint, int, mediumint, mediumtext, real, text, timestamp, tinyint, varchar } from 'drizzle-orm-mysql/columns';
import { MySqlConnector } from 'drizzle-orm-mysql/connection';
import { foreignKey } from 'drizzle-orm-mysql/foreign-keys';
import { mysqlTable } from 'drizzle-orm-mysql/table';
import { getTableColumns } from 'drizzle-orm-mysql/utils';
import { eq } from 'drizzle-orm/expressions';
import mysql from 'mysql2/promise';

const usersTable = mysqlTable(
	'users',
	{
		id: int('id').primaryKey(),
		homeCity: int('home_city')
			.notNull(),
		currentCity: mediumint('current_city'),
		serialNullable: tinyint('serial1'),
		serialNotNull: int('serial2').notNull(),
		class: text('class'),
		varc: varchar('class', 255),
		varc1: varchar<'sdf' | 'sd'>('class', 255),
		subClass: mediumtext<'A' | 'dd'>('sub_class'),
		age1: int('age1').notNull(),
		// createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	},
);

const citiesTable = mysqlTable(
	'cities',
	{
		id: int('id').primaryKey(),
		userId: int('user_id'),
		name: text('name'),
	},
	(cities) => ({
		ageSelfFK: foreignKey(() => ({
			columns: [cities.id],
			foreignColumns: [usersTable.id],
		})).onUpdate('no action'),
	}),
);

export const datesTable = mysqlTable('dates', {
	id: int('id').autoincrement().notNull(),
	big: bigint('big', { mode: 'number' }).default(12),
	timestamp: timestamp('TIMESTAMP'),
});

export const chatGroups = mysqlTable('chat_groups', {
	id: int('id').autoincrement(),
	name: varchar('name', 255),
});

// console.log(getTableForeignKeys(usersTable));

// const citiesTable = pgTable('cities', {
// 	id: serial('id').primaryKey(),
// 	name: text('name').notNull(),
// 	population: integer('population').default(0),
// });

// const classesTable = pgTable('classes', {
// 	id: serial('id').primaryKey(),
// 	class: text<'A' | 'C'>('class'),
// 	subClass: text<'B' | 'D'>('sub_class').notNull(),
// });

// declare function oneToMany(...args: any): any;

async function main() {
	const pool = mysql.createPool({
		host: 'localhost',
		user: 'root',
		password: 'password123',
		database: 'test',
		waitForConnections: true,
		connectionLimit: 10,
	});

	const connector = new MySqlConnector(pool, { usersTable, citiesTable, datesTable, chatGroups });
	const realDb = await connect(connector);

	// await pool.query('INSERT INTO dates (`TIMESTAMP`) VALUES (?)', [new Date()]);
	// const res = await pool.query({ sql: 'SELECT * FROM dates' });
	const res = await realDb.usersTable.select().execute();
	try {
		await realDb.datesTable.insert({ timestamp: new Date() }).execute();
	} catch (e) {
		console.log(e);
	}

	const col = getTableColumns(usersTable);
	// RETURNING always what mysql respond
	// add autoincrement instead of serial
	//

	// const insertRes = await realDb.usersTable.insert({
	// 	id: 4,
	// 	homeCity: 3,
	// 	serialNotNull: 4,
	// 	class: 'C',
	// 	age1: 3,
	// }).execute();

	// const updateRes = await realDb.usersTable.update().set({ homeCity: 12 }).where(eq(usersTable.id, 4)).execute();

	// console.log(updateRes);

	// const res = await realDb.citiesTable.select()
	// 	.innerJoin(usersTable, eq(usersTable.id, citiesTable.userId), { id: usersTable.id })
	// 	.execute();

	// console.log(res[0]);
	// console.log(new Date((res[0] as any)[0]['TIMESTAMP']));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
