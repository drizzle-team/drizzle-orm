import { sql } from 'drizzle-orm';

import { check } from '~/checks';
import { int, mysqlEnum, serial, text, timestamp, varchar } from '~/columns';
import { foreignKey } from '~/foreign-keys';
import { index } from '~/indexes';
import { mysqlTable } from '~/table';

export const users = mysqlTable(
	'users_table',
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
		varchar: varchar('varchar', { length: 255 }).notNull(),
		age1: int('age1').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		updatedAt: timestamp('updated_at').notNull().onUpdateNow(),
		createdAtString: timestamp('created_at_string', { mode: 'string' }).notNull().defaultNow(),
		updatedAtString: timestamp('created_at_string', { mode: 'string' }).notNull().onUpdateNow(),
		enumCol: mysqlEnum('enum_col', { values: ['a', 'b', 'c'] }).notNull(),
	},
	(users) => ({
		usersAge1Idx: index('usersAge1Idx', users.class, {
			using: sql`custom`,
		}),
		usersAge2Idx: index('usersAge2Idx', users.class),
		uniqueClass: index('uniqueClass', [users.class, users.subClass], {
			unique: true,
			using: 'btree',
			lock: 'exclusive',
			algorythm: 'default',
		}),
		legalAge: check('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey(() => ({ columns: [users.subClass], foreignColumns: [classes.subClass] })),
		usersClassComplexFK: foreignKey(() => ({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		})),
	}),
);

export const cities = mysqlTable('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: int('population').default(0),
}, (cities) => ({
	citiesNameIdx: index('citiesNameIdx', cities.id),
}));

export const classes = mysqlTable('classes_table', {
	id: serial('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text<'B' | 'D'>('sub_class').notNull(),
});
