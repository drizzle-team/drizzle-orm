import { connect, migrate, param, sql } from 'drizzle-orm';
import { constraint, foreignKey, index, InferModel, PgConnector, pgTable } from 'drizzle-orm-pg';
import { integer, interval, numeric, serial, text, timestamp } from 'drizzle-orm-pg/columns';
import { PgTestConnector } from 'drizzle-orm-pg/testing';
import { and, asc, desc, eq, or } from 'drizzle-orm/expressions';
import { Pool } from 'pg';

export const users = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),
		testNumeric: numeric('test_numeric').notNull(),
		name: text('name').notNull(),
		name1: text('name1').notNull(),
		homeCity: integer('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: integer('current_city').references(() => cities.id),
		serial1: serial('serial1'),
		serial2: serial('serial2').notNull(),
		class: text<'A' | 'C'>('class').notNull(),
		subClass: text<'B' | 'D'>('sub_class'),
		age1: integer('age1').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
		interval1: interval('interval1', { fields: 'day to second', precision: 3 }),
	},
	(users) => ({
		usersAge1Idx: index('usersAge1Idx', users.class, { unique: true }),
		uniqueClass: index('uniqueClass', [users.class, users.subClass], {
			unique: true,
			where: sql`${users.class} is not null`,
			order: 'desc',
			nulls: 'last',
			concurrently: true,
			using: sql`btree`,
		}),
		legalAge: constraint('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey(() => [users.class, classes, classes.class]),
		usersClassComplexFK: foreignKey(() => [
			[users.class, users.subClass],
			classes,
			[classes.class, classes.subClass],
		]),
	}),
);

type SelectUser = InferModel<typeof users>;
type InsertUser = InferModel<typeof users, 'insert'>;

const cities = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
});

const classes = pgTable('classes', {
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
	const connector = new PgConnector(client, { users, cities });
	const realDb = await connect(connector);

	// const db = await connect(new PgTestConnector(client, { users, cities }));
	// await migrate(connector, { migrationsFolder: 'drizzle' });
	// drizzle.migrate(db, './');

	// const pgConnector = new PgTestConnector(client);
	// drizzle.migrate(pgConnector, './');

	const db = await connect(new PgTestConnector({ users, cities, classes }));

	const numericTest = await realDb.users.select({ num: users.testNumeric }).execute();
	console.log(numericTest);

	const selectResult = await realDb.users
		.select({ id: users.id, age: users.age1 })
		.innerJoin(cities, eq(users.homeCity, cities.id), { name: cities.name })
		.execute()
		.then((result) =>
			result.map(({ users, cities }) => ({
				...users,
				city: cities,
			}))
		);

	// const selectResult1 = await db.users
	// 	.select()
	// 	.leftJoin(cities, (joins) => eq(users.homeCity, joins.cities1.id))
	// 	.execute();

	const newUser: InsertUser = {
		testNumeric: '1.23',
		name: 'John',
		name1: 'John1',
		homeCity: 1,
		class: 'A',
		age1: 1,
	};

	const insertResult = await db.users.insert(newUser).returning({
		id: users.id,
		id2: users.id,
		serial1: users.serial1,
		serial2: users.serial2,
		lowerClass: sql.response`lower(${users.class})`,
	}).execute();

	const result1 = await db.users.insert(newUser).execute();

	const result2 = await db.users.delete().where(eq(users.id, 1)).execute();

	console.log(result1);

	db.users.insert([newUser, newUser]).execute();
	db.users.insert(newUser).returning().execute();
	db.users.insert([newUser, newUser]).returning({ id: users.id }).execute();
	db.users.insert(newUser).returning().execute();

	db.users.insert(newUser).onConflictDoNothing().execute();
	db.users
		.insert(newUser)
		.onConflictDoNothing((c) => c.legalAge)
		.execute();
	db.users
		.insert(newUser)
		.onConflictDoUpdate((c) => c.legalAge, { age1: 21 })
		.returning()
		.execute();
	const insertExample = await db.users
		.insert(newUser)
		.onConflictDoUpdate(sql`(name) where name is not null`, { age1: 21 })
		.returning()
		.execute();

	const update1 = await db.users
		.update()
		.set({
			id: 1,
			name: 'qwe',
			name1: sql`${users.name} || 'qwe'`,
		})
		.where(
			or(
				and(eq(users.class, 'A'), eq(users.subClass, 'B')),
				and(eq(users.class, 'C'), eq(users.subClass, 'D')),
				// and(eq(cities.name, 'New York')),
			),
		)
		.returning({ id: users.id })
		.execute();

	const join1 = await db.users
		.select({ id: users.id, maxAge: sql.response`max(${users.age1})` })
		.where(sql`${users.age1} > 0`)
		.execute();

	const join2 = await db.users
		.select()
		.where(sql`${users.age1} > 0`)
		.execute();

	db.users
		.select({ id: users.homeCity })
		.innerJoin({ cities1: cities }, (aliases) => eq(aliases.cities1.id, users.id), (table) => ({ id: table.id }))
		.innerJoin({ cities2: cities }, (joins) => eq(joins.cities1.id, users.id), (table) => ({ name23: table.id }))
		.innerJoin({ cities3: cities }, (joins) => eq(joins.cities2.id, users.id), (table) => ({ id: table.id }))
		.innerJoin({ cities4: cities }, (joins) => eq(joins.cities4.id, users.id), (table) => ({ id: table.id }))
		.where((joins) => sql`${users.age1} > 12`)
		.orderBy(desc(users.id))
		.limit(1)
		.offset(2)
		.execute();

	const t = desc(users.id);
	const t1 = eq(users.class, 'A');

	db.users
		.select({ id: users.id })
		// .leftJoin/rightJoin/fullJoin/innerJoin
		.innerJoin({ cities1: cities }, (joins) => sql`${users.id} = ${joins.cities1.id}`, (cities) => ({
			id: cities.id,
		}))
		.innerJoin({ cities2: cities }, (joins) => sql`${joins.cities1.id} = ${joins.cities2.id}`)
		.where(sql`${users.age1} > 0`)
		// .where((joins) => sql`${joins.users.age1} > 0`)
		// .where(eq(users.age1, 1))
		// .where((joins) => eq(joins.users.age1, 1))
		.orderBy(asc(users.id), desc(users.name))
		// .orderBy((joins) => [asc(users.id), desc(joins.cities1.id)])
		// .orderBy((joins) => sql`${users.age1} ASC`)
		// .orderBy(sql`${users.age1} ASC`)
		.execute();

	const megaJoin = await db.users
		.select({ id: users.id, maxAge: sql.response`max(${users.age1})` })
		.innerJoin(cities, sql`${users.id} = ${cities.id}`, { id: cities.id })
		.innerJoin({ homeCity: cities }, (aliases) => sql`${users.homeCity} = ${aliases.homeCity.id}`)
		.innerJoin({ class: classes }, (aliases) => eq(aliases.class.id, users.class))
		.innerJoin({ otherClass: classes }, (aliases) => sql`${aliases.class.id} = ${aliases.otherClass.id}`)
		.innerJoin({ anotherClass: classes }, (aliases) => sql`${users.class} = ${aliases.anotherClass.id}`)
		.innerJoin({ friend: users }, (aliases) => sql`${users.id} = ${aliases.friend.id}`)
		.innerJoin({ currentCity: cities }, (aliases) => sql`${aliases.homeCity.id} = ${aliases.currentCity.id}`)
		.innerJoin({ subscriber: users }, (aliases) => sql`${users.class} = ${aliases.subscriber.id}`)
		.innerJoin({ closestCity: cities }, (aliases) => sql`${users.currentCity} = ${aliases.closestCity.id}`)
		.where(sql`${users.age1} > 0`)
		.execute();

	const userId = 5;

	// const test = sql`lower(${users.currentCity})`;

	const update = await db.users
		.update()
		.set({
			id: userId,
			age1: sql`${users.age1} + ${param(users.age1, 1)}`,
			currentCity: sql`lower(${users.currentCity})`,
		})
		.where(eq(users.id, 1))
		// .returning({ id: users.id })
		.execute();

	// const query = realDb.users.delete().where(eq(users.id, 2)).getQuery();
	// realDb.execute(query);
	// realDb.execute(sql`delete from ${users} where ${users.id} = 2`);
	db.users
		.delete()
		.where(sql`${users.id} = ${2}`)
		.returning()
		.execute();
	// 2 won't be in prepared statement params
	const deleteRes = await db.users
		.delete()
		.where(sql`${users.id} = 2`)
		.returning({ id: users.id })
		.execute();

	db.users.delete().returning().execute();

	db.users.delete().execute();

	client.release();
	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
