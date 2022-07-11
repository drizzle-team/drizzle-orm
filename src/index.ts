// import { Pool } from 'pg';
import { Column, InferType, table } from './core';

import { or, and, eq, max, gt } from './operators';
import { int, serial, text } from './pg/columns';
import { connect } from './pg/core';
import { sql } from './sql';

const users = table('users', {
	id: serial('id').primaryKey(),
	city: text('city').notNull().default('Dnipro'),
	serialNullable: serial('serial1'),
	serialNotNull: serial('serial1').notNull(),
	class: text('class').notNull(),
	subClass: text('sub_class'),
	age: int('age').notNull(),
});

type InsertUser = InferType<typeof users, 'insert'>;

const newUser: InsertUser = {
	class: 'class1',
	subClass: 'subClass1',
	age: 1,
};

type SelectUser = InferType<typeof users>;

const cities = table('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: int('population').default(0),
});

const pool = {};

const db = connect(pool, { users, cities });

db.users
	.update()
	.set(sql`${users.age} = ${users.age} + 1`)
	.where(
		or(
			and(eq(users.class, 'A'), eq(users.subClass, 'B')),
			and(eq(users.class, 'C'), eq(users.subClass, 'D')),
			// and(eq(cities.name, 'New York')),
		),
	)
	.execute();

db.users
	.select({ id: users.id, maxAge: sql`max(${users.age})` })
	.where(sql`${users.age} > 0`)
	.execute();

db.users
	.select({
		id: users.id,
		maxAge: max(users.age),
	})
	.where(gt(users.age, 0))
	.execute();

db.users
	.update()
	.set(sql`${users.age} = ${users.age} + 1`)
	.where(
		sql`(${users.class} = 'A' and ${users.subClass} = 'B') or (${users.class} = 'C' and ${users.subClass} = 'D')`,
	)
	.execute();

db.users
	.update()
	.set(sql`${users.age} = ${users.age} + 1`)
	.where(eq(users.id, 1))
	.execute();

const userId = 5;

db.users
	.update()
	.set(sql`${users.id} = ${userId}, ${users.age} = ${users.age} + 1`)
	.returning()
	.execute();
