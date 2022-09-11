import { sql } from 'drizzle-orm';
import { ColumnData, TableName } from 'drizzle-orm/branded-types';

import { Check, check } from '~/checks';
import { integer, pgEnum, PgTextBuilder, serial, text, timestamp } from '~/columns';
import { foreignKey } from '~/foreign-keys';
import { Index, index } from '~/indexes';
import { GetTableColumns, pgTable } from '~/table';
import { getTableConflictConstraints } from '~/utils';
import { Equal, Expect } from '../utils';

const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);

export const users = pgTable(
	'users_table',
	{
		id: serial('id').primaryKey(),
		homeCity: integer('home_city')
			.notNull()
			.references(() => cities.id),
		currentCity: integer('current_city').references(() => cities.id),
		serialNullable: serial('serial1'),
		serialNotNull: serial('serial2').notNull(),
		class: text<'A' | 'C'>('class').notNull(),
		subClass: text<'B' | 'D'>('sub_class'),
		text: text('text'),
		age1: integer('age1').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		enumCol: myEnum('enum_col').notNull(),
	},
	(users) => ({
		usersAge1Idx: index('usersAge1Idx', users.class, {
			unique: true,
		}),
		usersAge2Idx: index('usersAge2Idx', users.class),
		uniqueClass: index('uniqueClass', [users.class, users.subClass], {
			unique: true,
			where: sql`${users.class} is not null`,
			order: 'desc',
			nulls: 'last',
			concurrently: true,
			using: sql`btree`,
		}),
		legalAge: check('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey(() => ({ columns: [users.subClass], foreignColumns: [classes.subClass] })),
		usersClassComplexFK: foreignKey(() => ({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		})),
	}),
);

const usersConflictConstraints = getTableConflictConstraints(users);
Expect<
	Equal<{
		usersAge1Idx: Index<TableName<'users_table'>, GetTableColumns<typeof users>, true>;
		uniqueClass: Index<TableName<'users_table'>, GetTableColumns<typeof users>, true>;
		legalAge: Check<TableName<'users_table'>>;
	}, typeof usersConflictConstraints>
>;

export const cities = pgTable('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: integer('population').default(0),
}, (cities) => ({
	citiesNameIdx: index('citiesNameIdx', cities.id),
}));

const citiesConflictConstraints = getTableConflictConstraints(cities);
Expect<Equal<{}, typeof citiesConflictConstraints>>;

export const classes = pgTable('classes_table', {
	id: serial('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text<'B' | 'D'>('sub_class').notNull(),
});

const classesConflictConstraints = getTableConflictConstraints(classes);
Expect<Equal<{}, typeof classesConflictConstraints>>;
