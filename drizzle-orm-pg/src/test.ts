// import { connect, sql } from 'drizzle-orm';
// import { InferType } from 'drizzle-orm/operations';
// import { and, or, eq, gt, max } from 'drizzle-orm/operators';

// import { int, serial, text } from './columns';
// import { PgTable, pgTable } from './table';

// // import { Pool } from 'pg';
// export const users = pgTable(
// 	'users',
// 	{
// 		id: serial('id').primaryKey(),
// 		city: int('city').references(() => cities.id),
// 		serialNullable: serial('serial1'),
// 		serialNotNull: serial('serial1').notNull(),
// 		class: text<'A' | 'C'>('class').notNull(),
// 		subClass: text('sub_class'),
// 		age1: int('age1').notNull(),
// 		// age2: int('age2').notNull(),
// 		// age3: int('age3').notNull(),
// 		// age4: int('age4').notNull(),
// 		// age5: int('age5').notNull(),
// 	},
// 	// (users) => ({
// 	// 	usersAge1Idx: index([users.age1], { unique: true }),
// 	// 	// classFK: foreignKey(() => [
// 	// 	// 	[users.class, users.subClass],
// 	// 	// 	classes,
// 	// 	// 	[classes.class, classes.subClass],
// 	// 	// ]),
// 	// }),
// );

// type InsertUser = InferType<typeof users, 'insert'>;

// const newUser: InsertUser = {
// 	class: 'A',
// 	city: 1,
// 	subClass: 'subClass1',
// 	age1: 1,
// };

// type SelectUser = InferType<typeof users>;

// const cities = pgTable('cities', {
// 	id: serial('id').primaryKey(),
// 	name: text('name').notNull(),
// 	population: int('population').default(0),
// });

// const classes = pgTable('classes', {
// 	id: serial('id').primaryKey(),
// 	class: text('class').notNull(),
// 	subClass: text('sub_class').notNull(),
// });

// const pool = {};

// async function main() {
// 	// const db = await connectWith(new PgConnector(pool, { users, cities }));
// 	const db = await connect('pg', pool, { users, cities });

// 	// db.users.insert().onConflictDoNothing();

// 	// db.users.update().set();

// 	// 'on update set age = age + 1, name = new.name'

// 	// db.users
// 	// 	.insert()
// 	// 	.onConflict(({ usersAge1Age2UqIdx, ageMore18 }) =>
// 	// 		usersAge1Age2UqIdx.doNothing(),
// 	// 	);

// 	// db.users
// 	// 	.insert()
// 	// 	.onConflict(({ usersAge1Age2UqIdx, ageMore18 }) => usersAge1Age2UqIdx);

// 	db.users
// 		.update()
// 		.set(sql`${users.age1} = ${users.age1} + 1`)
// 		.where(
// 			or(
// 				and(eq(users.class, 'A'), eq(users.subClass, 'B')),
// 				and(eq(users.class, 'C'), eq(users.subClass, 'D')),
// 				// and(eq(cities.name, 'New York')),
// 			),
// 		)
// 		.execute();

// 	// const f = await db.users.update().set().where().returning().execute();

// 	// type g = InferTableNameFromJoins<{ cities: InferColumns<Table<{}, 'users'>> }>
// 	// type g = NameWithAliasFromJoins<{ users: InferColumns<Table<{}, 'users'>> }, '1'>
// 	// type f = Increment<'users', { users: 1 }>;
// 	// const g: f['users'];

// 	db.users
// 		.select({ id: users.id, maxAge: sql`max(${users.age1})` })
// 		// .innerJoin(classes, (joins) => eq(joins.classes.id, joins.users.id))
// 		.innerJoin(
// 			cities,
// 			(joins) => sql`${joins.users.id} = ${joins.cities1.id}`,
// 			(cities) => ({
// 				id: cities.id,
// 			}),
// 		)
// 		// .innerJoin(cities, (joins) => sql`${joins.cities1.id} = ${joins.cities1.id}`)
// 		// .innerJoin(classes, (joins) => eq(joins.cities1.id, joins.cities2.id))
// 		// .innerJoin(classes, (joins) => sql`${joins.classes1.id} = ${joins.classes2.id}`)
// 		// .innerJoin(classes, (joins) => sql`${joins.users.class} = ${joins.classes3.id}`)
// 		// .innerJoin(users, (joins) => sql`${joins.users.class} = ${joins.users1.id}`)
// 		// .innerJoin(cities, (joins) => sql`${joins.cities1.id} = ${joins.classes1.id}`)
// 		// .innerJoin(users, (joins) => sql`${joins.users.class} = ${joins.users2.id}`)
// 		// .innerJoin(cities, (joins) => sql`${joins.users.class} = ${joins.cities.id}`)
// 		// .where((joins) => sql`${joins.users.age1} > 0`)
// 		.where(sql`${users.age1} > 0`)
// 		.execute();

// 	const res = await db.users
// 		.select({ id23: users.id })
// 		// .where(sql`${users.age1} > 0`)
// 		.innerJoin(
// 			cities,
// 			(joins) => sql`${joins.cities1.id} = ${joins.cities1.id}`,
// 			(cities) => ({ id13: cities.name }),
// 		)
// 		.where(sql`${users.age1} > 0`)
// 		.execute();

// 	// const g = res[0]!.id23;

// 	// res[0]
// 	// const g = res.map((it) => {
// 	// 	return {
// 	// 		city: it.cities1.id,
// 	// 		user: it.users.city,
// 	// 	};
// 	// });

// 	const selectWithJoinRes = [
// 		{ user: { id2: 1 }, city: { idkf: 2 }, city1: { idk12f: 3 } },
// 		{ user: { id2: 3 }, city: { idkf: 4 }, city1: { idk12f: 5 } },
// 	];

// 	db.users
// 		.update()
// 		.set(sql`${users.age1} = ${users.age1} + 1`)
// 		.where(
// 			sql`(${users.class} = 'A' and ${users.subClass} = 'B') or (${users.class} = 'C' and ${users.subClass} = 'D')`,
// 		)
// 		.execute();

// 	db.users
// 		.update()
// 		.set(sql`${users.age1} = ${users.age1} + 1`)
// 		.where(eq(users.id, 1))
// 		.execute();

// 	const userId = 5;

// 	db.users
// 		.update()
// 		.set(sql`${users.id} = ${userId}, ${users.age1} = ${users.age1} + 1`)
// 		.returning()
// 		.execute();
// }

// main().catch((e) => {
// 	console.error(e);
// 	process.exit(1);
// });
