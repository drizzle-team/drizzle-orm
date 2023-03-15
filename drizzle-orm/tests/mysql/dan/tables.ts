import { type Equal, Expect } from 'tests/utils';
import { eq, gt } from '~/expressions';
import {
	check,
	foreignKey,
	index,
	int,
	type MySqlColumn,
	mysqlEnum,
	mysqlTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from '~/mysql-core';
import { mysqlSchema } from '~/mysql-core/schema';
import { mysqlView, type MySqlViewWithSelection } from '~/mysql-core/view';
import { sql } from '~/sql';

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
		text: text('text'),
		age1: int('age1').notNull(),
		createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
		enumCol: mysqlEnum('enum_col', ['a', 'b', 'c']).notNull(),
	},
	(users) => ({
		usersAge1Idx: uniqueIndex('usersAge1Idx').on(users.class),
		usersAge2Idx: index('usersAge2Idx').on(users.class),
		uniqueClass: uniqueIndex('uniqueClass')
			.on(users.class, users.subClass)
			.lock('default')
			.algorythm('copy')
			.using(`btree`),
		legalAge: check('legalAge', sql`${users.age1} > 18`),
		usersClassFK: foreignKey({ columns: [users.subClass], foreignColumns: [classes.subClass] }),
		usersClassComplexFK: foreignKey({
			columns: [users.class, users.subClass],
			foreignColumns: [classes.class, classes.subClass],
		}),
		pk: primaryKey(users.age1, users.class),
	}),
);

export const cities = mysqlTable('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: int('population').default(0),
}, (cities) => ({
	citiesNameIdx: index('citiesNameIdx').on(cities.id),
}));

export const customSchema = mysqlSchema('custom_schema');

export const citiesCustom = customSchema.table('cities_table', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	population: int('population').default(0),
}, (cities) => ({
	citiesNameIdx: index('citiesNameIdx').on(cities.id),
}));

Expect<Equal<typeof cities, typeof citiesCustom>>;

export const classes = mysqlTable('classes_table', {
	id: serial('id').primaryKey(),
	class: text<'A' | 'C'>('class'),
	subClass: text<'B' | 'D'>('sub_class').notNull(),
});

export const newYorkers = mysqlView('new_yorkers')
	.algorithm('merge')
	.definer('root@localhost')
	.sqlSecurity('definer')
	.as((qb) => {
		const sq = qb
			.$with('sq')
			.as(
				qb.select({ userId: users.id, cityId: cities.id })
					.from(users)
					.leftJoin(cities, eq(cities.id, users.homeCity))
					.where(sql`${users.age1} > 18`),
			);
		return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
	});

Expect<
	Equal<
		MySqlViewWithSelection<'new_yorkers', false, {
			userId: MySqlColumn<{
				data: number;
				driverParam: number;
				notNull: true;
				hasDefault: true;
				tableName: 'new_yorkers';
			}>;
			cityId: MySqlColumn<{
				data: number;
				driverParam: number;
				notNull: false;
				hasDefault: true;
				tableName: 'new_yorkers';
			}>;
		}>,
		typeof newYorkers
	>
>;

{
	const newYorkers = customSchema.view('new_yorkers')
		.algorithm('merge')
		.definer('root@localhost')
		.sqlSecurity('definer')
		.as((qb) => {
			const sq = qb
				.$with('sq')
				.as(
					qb.select({ userId: users.id, cityId: cities.id })
						.from(users)
						.leftJoin(cities, eq(cities.id, users.homeCity))
						.where(sql`${users.age1} > 18`),
				);
			return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
		});

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlColumn<{
					data: number;
					driverParam: number;
					notNull: true;
					hasDefault: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlColumn<{
					data: number;
					driverParam: number;
					notNull: false;
					hasDefault: true;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = mysqlView('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	})
		.algorithm('merge')
		.definer('root@localhost')
		.sqlSecurity('definer')
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlColumn<{
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlColumn<{
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = customSchema.view('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	})
		.algorithm('merge')
		.definer('root@localhost')
		.sqlSecurity('definer')
		.as(
			sql`select ${users.id} as user_id, ${cities.id} as city_id from ${users} left join ${cities} on ${
				eq(cities.id, users.homeCity)
			} where ${gt(users.age1, 18)}`,
		);

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', false, {
				userId: MySqlColumn<{
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlColumn<{
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = mysqlView('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	}).existing();

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', true, {
				userId: MySqlColumn<{
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlColumn<{
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}

{
	const newYorkers = customSchema.view('new_yorkers', {
		userId: int('user_id').notNull(),
		cityId: int('city_id'),
	}).existing();

	Expect<
		Equal<
			MySqlViewWithSelection<'new_yorkers', true, {
				userId: MySqlColumn<{
					data: number;
					driverParam: string | number;
					hasDefault: false;
					notNull: true;
					tableName: 'new_yorkers';
				}>;
				cityId: MySqlColumn<{
					notNull: false;
					hasDefault: false;
					data: number;
					driverParam: string | number;
					tableName: 'new_yorkers';
				}>;
			}>,
			typeof newYorkers
		>
	>;
}
