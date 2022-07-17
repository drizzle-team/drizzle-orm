// import { Pool } from 'pg';
import { connect, sql } from 'drizzle-orm';
import {
	AnyPgTable,
	constraint,
	foreignKey,
	index,
	InferType,
	PgTable,
	pgTable,
	PgTableWithColumns,
	TableConflictConstraints,
} from 'drizzle-orm-pg';
import { int, serial, text } from 'drizzle-orm-pg/columns';
import { PgTestConnector } from 'drizzle-orm-pg/testing';
import { eq, inc, max } from 'drizzle-orm/expressions';

export const users = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),
		homeCity: int('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: int('current_city').references(() => cities.id),
		serialNullable: serial('serial1'),
		serialNotNull: serial('serial2').notNull(),
		class: text<'A' | 'C'>('class').notNull(),
		subClass: text<'B' | 'D'>('sub_class'),
		age1: int('age1').notNull(),
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
		usersClassFK: foreignKey(() => [users.class, classes, classes.class]),
		usersClassComplexFK: foreignKey(() => [
			[users.class, users.subClass],
			classes,
			[classes.class, classes.subClass],
		]),
	}),
);

type SelectUser = InferType<typeof users>;
type InsertUser = InferType<typeof users, 'insert'>;

const newUser: InsertUser = {
	homeCity: 1,
	class: 'A',
	age1: 1,
};

const cities = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: int('population').default(0),
});

const classes = pgTable('classes', {
	id: serial('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text<'B' | 'D'>('sub_class').notNull(),
});

async function main() {
	// const db = await connect(new PgConnector(pool, { users, cities }));
	const db = await connect(new PgTestConnector({ users, cities }));

	// const t = await db.users
	// 	.select()
	// 	.innerJoin(cities, (joins) => sql`${joins.cities1.name}`)
	// 	.execute();

	db.users.insert([newUser, newUser]).execute();
	db.users.insert(newUser).execute();
	db.users.insert([newUser, newUser]).returning().execute();
	db.users.insert(newUser).returning().execute();

	db.users.insert(newUser).onConflictDoNothing().execute();
	db.users.insert(newUser).onConflictDoNothing((c) => c.legalAge).execute();
	db.users.insert(newUser).onConflictDoUpdate((c) => c.legalAge, { age1: 21 }).returning().execute();
	db.users.insert(newUser).onConflictDoUpdate(sql`(name) where name is not null`, { age1: 21 }).returning().execute();

	// db.users
	// 	.update()
	// 	.set({
	// 		id: 1,
	// 		name: 'qwe',
	// 		name1: sql`${users.name} || 'qwe'`,
	// 	})
	// 	.where(
	// 		or(
	// 			and(eq(users.class, 'A'), eq(users.subClass, 'B')),
	// 			and(eq(users.class, 'C'), eq(users.subClass, 'D')),
	// 			// and(eq(cities.name, 'New York')),
	// 		),
	// 	)
	// 	.returning({ id: users.id })
	// 	.execute();

	const join1 = await db.users
		.select({ id: users.id, maxAge: max(users.age1) })
		.where(sql`${users.age1} > 0`)
		.execute();

	db.users
		.select({ id: users.homeCity })
		.innerJoin(
			cities,
			(joins) => eq(joins.cities1.id, users.id),
			(table) => ({ id: table.id }),
		)
		.innerJoin(
			cities,
			(joins) => eq(joins.cities1.id, users.id),
			(table) => ({ name23: table.id }),
		)
		// .innerJoin(
		// 	cities,
		// 	(joins) => eq(joins.cities2.id, users.id),
		// 	(table) => ({ id: table.id }),
		// )
		// .innerJoin(
		// 	cities,
		// 	(joins) => eq(joins.cities4.id, users.id),
		// 	(table) => ({ id: table.id }),
		// )
		.where((joins) => sql`${users.age1} > 12`)
		// .orderBy(desc(users.id))
		// .orderBy((joins) => sql`${joins.cities1.name} asc`)
		// .orderBy(sql`${users.age1} ASC`)
		// .orderBy(asc(users.id))

		.limit(1)
		.offset(2)
		.execute();

	// db.users
	// 	.select({ id: users.id })
	// 	//.leftJoin/rightJoin/fullJoin/innerJoin
	// 	.innerJoin(
	// 		cities,
	// 		(joins) => sql`${joins.users.id} = ${joins.cities1.id}`,
	// 		(cities) => ({
	// 			id: cities.id,
	// 		}),
	// 	)
	// 	.innerJoin(cities, (joins) => sql`${joins.cities1.id} = ${joins.cities2.id}`)
	// 	.where(sql`${users.age1} > 0`)
	// 	//.where((joins) => sql`${joins.users.age1} > 0`)
	// 	//.where(eq(users.age1, 1))
	// 	//.where((joins) => eqjoins.users.age1, 1))
	// 	// .orderBy(asc(users.id), desc(users.name))
	// 	//.orderBy((joins)=> [asc(joins.users.id), desc(joins.cities1.id)])
	// 	//.orderBy((joins)=> sql`${joins.users.age1} ASC`)
	// 	.execute();

	// const megaJoin = await db.users
	// 	.select({ id: users.id, maxAge: sql.response<number>()`max(${users.age1})` })
	// 	// .innerJoin(classes, (joins) => eq(joins.classes.id, joins.users.id))
	// 	.innerJoin(
	// 		cities,
	// 		(joins) => sql`${users.id} = ${joins.cities1.id}`,
	// 		(cities) => ({
	// 			id: cities.id,
	// 		}),
	// 	)
	// 	.innerJoin(cities, (joins) => sql`${joins.cities1.id} = ${joins.cities1.id}`)
	// 	.innerJoin(classes, (joins) => eq(joins.cities1.id, joins.cities2.id))
	// 	.innerJoin(classes, (joins) => sql`${joins.classes1.id} = ${joins.classes2.id}`)
	// 	.innerJoin(classes, (joins) => sql`${users.class} = ${joins.classes3.id}`)
	// 	.innerJoin(users, (joins) => sql`${users.class} = ${joins.users1.id}`)
	// 	.innerJoin(cities, (joins) => sql`${joins.cities1.id} = ${joins.classes1.id}`)
	// 	.innerJoin(users, (joins) => sql`${users.class} = ${joins.users2.id}`)
	// 	.innerJoin(cities, (joins) => sql`${users.class} = ${joins.cities4.id}`)
	// 	.where((joins) => sql`${users.age1} > 0`)
	// 	.execute();

	const userId = 5;

	const test = sql`lower(${users.currentCity})`;

	const update = await db.users
		.update()
		.set({
			id: userId,
			age1: inc(users.age1, 1),
			serialNullable: null,
			currentCity: sql`lower(${users.currentCity})`,
		})
		.where(eq(users.id, 1))
		.returning()
		.execute();

	db.users.delete().where(eq(users.id, 2)).returning().execute();
	db.users
		.delete()
		.where(sql`${users.id} = ${2}`)
		.returning()
		.execute();
	// 2 won't be in prepared statement params
	db.users
		.delete()
		.where(sql`${users.id} = 2`)
		.returning()
		.execute();

	db.users.delete().returning().execute();

	db.users.delete().execute();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
