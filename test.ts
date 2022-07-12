// import { Pool } from 'pg';
import { connect, sql, InferType } from 'drizzle-orm';
import { pgTable, index, constraint, ForeignKeyBuilder, foreignKey } from 'drizzle-orm-pg';
import { int, serial, text } from 'drizzle-orm-pg/columns';
import { tableConflictConstraints } from 'drizzle-orm-pg/utils';
import { or, and, eq, max, gt } from 'drizzle-orm/operators';

export const users = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),
		homeCity: int('home_city').references(() => cities.id),
		currentCity: int('current_city').references(() => cities.id),
		serialNullable: serial('serial1'),
		serialNotNull: serial('serial1').notNull(),
		class: text<'A' | 'C'>('class').notNull(),
		subClass: text('sub_class'),
		age1: int('age1').notNull(),
	},
	(users) => ({
		usersAge1Idx: index(users.class, { unique: true }),
		usersAge2Idx: index(users.class),
		uniqueClass: index([users.class, users.subClass], {
			unique: true,
			where: sql`${users.class} is not null`,
		}),
		legalAge: constraint(sql`${users.age1} > 18`),
		usersClassFK: foreignKey(() => [users.class, classes, classes.class]),
		usersClassComplexFK: foreignKey(() => [
			[users.class, users.subClass],
			classes,
			[classes.class, classes.subClass],
		]),
	}),
);

const t = users[tableConflictConstraints];
type Constraints = keyof typeof t;
//    ^?

type InsertUser = InferType<typeof users, 'insert'>;

const newUser: InsertUser = {
	class: 'A',
	homeCity: 1,
	currentCity: 2,
	subClass: 'subClass1',
	age1: 1,
};

type SelectUser = InferType<typeof users>;

const cities = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: int('population').default(0),
});

const classes = pgTable('classes', {
	id: serial('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text('sub_class').notNull(),
});

const pool = {};

async function main() {
	// const db = await connectWith(new PgConnector(pool, { users, cities }));
	const db = await connect('pg', pool, { users, cities });

	// db.users.insert().onConflictDoNothing();

	// db.users.update().set();

	// db.users
	// 	.insert()
	// 	.onConflict(({ usersAge1Age2UqIdx, ageMore18 }) =>
	// 		usersAge1Age2UqIdx.doNothing(),
	// 	);

	// db.users
	// 	.insert()
	// 	.onConflict(({ usersAge1Age2UqIdx, ageMore18 }) => usersAge1Age2UqIdx);

	db.users
		.update()
		.set(sql`${users.age1} = ${users.age1} + 1`)
		.where(
			or(
				and(eq(users.class, 'A'), eq(users.subClass, 'B')),
				and(eq(users.class, 'C'), eq(users.subClass, 'D')),
				// and(eq(cities.name, 'New York')),
			),
		)
		.execute();

	db.users
		.select({ id: users.id, maxAge: sql`max(${users.age1})` })
		.where(sql`${users.age1} > 0`)
		.execute();

	db.users
		.select({
			id: users.id,
			maxAge: max(users.age1),
		})
		.where(and(gt(users.age1, 18), sql`${users.age1} is not null`))
		.execute();

	db.users
		.update()
		.set(sql`${users.age1} = ${users.age1} + 1`)
		.where(
			sql`(${users.class} = 'A' and ${users.subClass} = 'B') or (${users.class} = 'C' and ${users.subClass} = 'D')`,
		)
		.execute();

	db.users
		.update()
		.set(sql`${users.age1} = ${users.age1} + 1`)
		.where(eq(users.id, 1))
		.execute();

	const userId = 5;

	db.users
		.update()
		.set(sql`${users.id} = ${userId}, ${users.age1} = ${users.age1} + 1`)
		.returning()
		.execute();

	db.users.insert().values(newUser).execute();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
