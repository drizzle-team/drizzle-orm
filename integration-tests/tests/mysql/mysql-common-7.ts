/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import {
	bigint,
	getTableConfig,
	index,
	int,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	text,
	timestamp,
	varchar,
} from 'drizzle-orm/mysql-core';
import { expect, expectTypeOf } from 'vitest';
import type { Test } from './instrumentation';
import { allTypesTable, createCitiesTable, createUsers2Table } from './schema2';

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test('select from a many subquery', async ({ db, push }) => {
		const citiesTable = createCitiesTable('cities_many_subquery');
		const users2Table = createUsers2Table('users_2_many_subquery', citiesTable);

		await push({ citiesTable, users2Table });

		await db.insert(citiesTable)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

		await db.insert(users2Table).values([
			{ name: 'John', cityId: 1 },
			{ name: 'Jane', cityId: 2 },
			{ name: 'Jack', cityId: 2 },
		]);

		const res = await db.select({
			population: db.select({ count: count().as('count') }).from(users2Table).where(
				eq(users2Table.cityId, citiesTable.id),
			).as(
				'population',
			),
			name: citiesTable.name,
		}).from(citiesTable);

		expectTypeOf(res).toEqualTypeOf<
			{
				population: number;
				name: string;
			}[]
		>();

		expect(res).toStrictEqual([{
			population: 1,
			name: 'Paris',
		}, {
			population: 2,
			name: 'London',
		}]);
	});

	test('select from a one subquery', async ({ db, push }) => {
		const citiesTable = createCitiesTable('cities_one_subquery');
		const users2Table = createUsers2Table('users_2_one_subquery', citiesTable);

		await push({ citiesTable, users2Table });

		await db.insert(citiesTable)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

		await db.insert(users2Table).values([
			{ name: 'John', cityId: 1 },
			{ name: 'Jane', cityId: 2 },
			{ name: 'Jack', cityId: 2 },
		]);

		const res = await db.select({
			cityName: db.select({ name: citiesTable.name }).from(citiesTable).where(eq(users2Table.cityId, citiesTable.id))
				.as(
					'cityName',
				),
			name: users2Table.name,
		}).from(users2Table);

		expectTypeOf(res).toEqualTypeOf<
			{
				cityName: string;
				name: string;
			}[]
		>();

		expect(res).toStrictEqual([{
			cityName: 'Paris',
			name: 'John',
		}, {
			cityName: 'London',
			name: 'Jane',
		}, {
			cityName: 'London',
			name: 'Jack',
		}]);
	});

	test('test $onUpdateFn and $onUpdate works with sql value', async ({ db, push }) => {
		const users = mysqlTable('users_on_update', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			updatedAt: timestamp('updated_at', {
				fsp: 6,
			})
				.notNull()
				.$onUpdate(() => sql`current_timestamp`),
		});

		await push({ users });

		await db.insert(users).values({
			name: 'John',
		});
		const insertResp = await db.select({ updatedAt: users.updatedAt }).from(users);
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const now = Date.now();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		await db.update(users).set({
			name: 'John',
		});
		const updateResp = await db.select({ updatedAt: users.updatedAt }).from(users);

		expect(insertResp[0]?.updatedAt.getTime() ?? 0).lessThan(now);
		expect(updateResp[0]?.updatedAt.getTime() ?? 0).greaterThan(now);
	});

	test.concurrent('all types', async ({ db, push }) => {
		await push({ allTypesTable });

		await db.insert(allTypesTable).values({
			serial: 1,
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
			bigintString: '5044565289845416380',
			binary: '1',
			boolean: true,
			char: 'c',
			date: new Date(1741743161623),
			dateStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			datetime: new Date(1741743161623),
			datetimeStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			decimal: '47521',
			decimalNum: 9007199254740991,
			decimalBig: 5044565289845416380n,
			double: 15.35325689124218,
			enum: 'enV1',
			float: 1.048596,
			real: 1.048596,
			text: 'C4-',
			int: 621,
			json: {
				str: 'strval',
				arr: ['str', 10],
			},
			medInt: 560,
			smallInt: 14,
			time: '04:13:22',
			timestamp: new Date(1741743161623),
			timestampStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			tinyInt: 7,
			varbin: '1010110101001101',
			varchar: 'VCHAR',
			year: 2025,
			blob: Buffer.from('string'),
			longblob: Buffer.from('string'),
			mediumblob: Buffer.from('string'),
			tinyblob: Buffer.from('string'),
			stringblob: 'string',
			stringlongblob: 'string',
			stringmediumblob: 'string',
			stringtinyblob: 'string',
		});

		const rawRes = await db.select().from(allTypesTable);

		type ExpectedType = {
			serial: number;
			bigint53: number | null;
			bigint64: bigint | null;
			bigintString: string | null;
			binary: string | null;
			boolean: boolean | null;
			char: string | null;
			date: Date | null;
			dateStr: string | null;
			datetime: Date | null;
			datetimeStr: string | null;
			decimal: string | null;
			decimalNum: number | null;
			decimalBig: bigint | null;
			double: number | null;
			float: number | null;
			int: number | null;
			json: unknown;
			medInt: number | null;
			smallInt: number | null;
			real: number | null;
			text: string | null;
			time: string | null;
			timestamp: Date | null;
			timestampStr: string | null;
			tinyInt: number | null;
			varbin: string | null;
			varchar: string | null;
			year: number | null;
			enum: 'enV1' | 'enV2' | null;
			blob: Buffer | null;
			tinyblob: Buffer | null;
			mediumblob: Buffer | null;
			longblob: Buffer | null;
			stringblob: string | null;
			stringtinyblob: string | null;
			stringmediumblob: string | null;
			stringlongblob: string | null;
		}[];

		const expectedRes: ExpectedType = [
			{
				serial: 1,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				bigintString: '5044565289845416380',
				binary: '1',
				boolean: true,
				char: 'c',
				date: new Date('2025-03-12T00:00:00.000Z'),
				dateStr: '2025-03-12',
				datetime: new Date('2025-03-12T01:32:42.000Z'),
				datetimeStr: '2025-03-12 01:32:41',
				decimal: '47521',
				decimalNum: 9007199254740991,
				decimalBig: 5044565289845416380n,
				double: 15.35325689124218,
				float: 1.0486,
				int: 621,
				json: { arr: ['str', 10], str: 'strval' },
				medInt: 560,
				smallInt: 14,
				real: 1.048596,
				text: 'C4-',
				time: '04:13:22',
				timestamp: new Date('2025-03-12T01:32:42.000Z'),
				timestampStr: '2025-03-12 01:32:41',
				tinyInt: 7,
				varbin: '1010110101001101',
				varchar: 'VCHAR',
				year: 2025,
				enum: 'enV1',
				blob: Buffer.from('string'),
				longblob: Buffer.from('string'),
				mediumblob: Buffer.from('string'),
				tinyblob: Buffer.from('string'),
				stringblob: 'string',
				stringlongblob: 'string',
				stringmediumblob: 'string',
				stringtinyblob: 'string',
			},
		];

		expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
		expect(rawRes).toStrictEqual(expectedRes);
	});

	test.concurrent('insert into ... select', async ({ db, push }) => {
		const notifications = mysqlTable('notifications', {
			id: int('id').primaryKey().autoincrement(),
			sentAt: timestamp('sent_at').notNull().defaultNow(),
			message: text('message').notNull(),
		});
		const users = mysqlTable('users_64', {
			id: int('id').primaryKey().autoincrement(),
			name: text('name').notNull(),
		});
		const userNotications = mysqlTable('user_notifications', {
			userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
			notificationId: int('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
		}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

		await push({ notifications, users, userNotications });

		await db
			.insert(notifications)
			.values({ message: 'You are one of the 3 lucky winners!' });
		const newNotification = await db
			.select({ id: notifications.id })
			.from(notifications)
			.then((result) => result[0]);

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db
			.insert(userNotications)
			.select(
				db
					.select({
						userId: users.id,
						notificationId: sql`(${newNotification!.id})`.as('notification_id'),
					})
					.from(users)
					.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
					.orderBy(asc(users.id)),
			);
		const sentNotifications = await db.select().from(userNotications);

		expect(sentNotifications).toStrictEqual([
			{ userId: 1, notificationId: newNotification!.id },
			{ userId: 3, notificationId: newNotification!.id },
			{ userId: 5, notificationId: newNotification!.id },
		]);
	});

	test.concurrent('insert into ... select with keys in different order', async ({ db, push }) => {
		const users1 = mysqlTable('users_65', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const users2 = mysqlTable('users_66', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users1, users2 });

		expect(
			() =>
				db
					.insert(users1)
					.select(
						db
							.select({
								name: users2.name,
								id: users2.id,
							})
							.from(users2),
					),
		).toThrowError();
	});

	test.concurrent('MySqlTable :: select with `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_67', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_67').on(users.name);

		await push({ users });

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		const result = await db.select()
			.from(users, {
				useIndex: [usersTableNameIndex],
			})
			.where(eq(users.name, 'David'));

		expect(result).toHaveLength(1);
		expect(result).toEqual([{ id: 4, name: 'David' }]);
	});

	test.concurrent('MySqlTable :: select with `use index` hint on 1 index', async ({ db, push }) => {
		const users = mysqlTable('users_68', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_68').on(users.name);

		await push({ users });

		const query = db.select()
			.from(users, {
				useIndex: usersTableNameIndex,
			})
			.where(eq(users.name, 'David'))
			.toSQL();

		expect(query.sql).to.include('USE INDEX (`users_name_index_68`)');
	});

	test.concurrent('MySqlTable :: select with `use index` hint on multiple indexes', async ({ db, push }) => {
		const users = mysqlTable('users_69', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
			age: int('age').notNull(),
		}, () => [usersTableNameIndex, usersTableAgeIndex]);
		const usersTableNameIndex = index('users_name_index_69').on(users.name);
		const usersTableAgeIndex = index('users_age_index_69').on(users.age);

		await push({ users });

		const query = db.select()
			.from(users, {
				useIndex: [usersTableNameIndex, usersTableAgeIndex],
			})
			.where(eq(users.name, 'David'))
			.toSQL();

		expect(query.sql).to.include('USE INDEX (`users_name_index_69`, `users_age_index_69`)');
	});

	test.concurrent('MySqlTable :: select with `use index` hint on not existed index', async ({ db, push }) => {
		const users = mysqlTable('users_70', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_70').on(users.name);

		await push({ users });

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await expect((async () => {
			return await db.select()
				.from(users, {
					useIndex: ['some_other_index'],
				})
				.where(eq(users.name, 'David'));
		})()).rejects.toThrowError();
	});

	test.concurrent(
		'MySqlTable :: select with `use index` + `force index` incompatible hints',
		async ({ db, push }) => {
			const users = mysqlTable('users_71', {
				id: serial('id').primaryKey(),
				name: varchar('name', { length: 100 }).notNull(),
				age: int('age').notNull(),
			}, () => [usersTableNameIndex, usersTableAgeIndex]);
			const usersTableNameIndex = index('users_name_index_71').on(users.name);
			const usersTableAgeIndex = index('users_age_index_71').on(users.age);

			await push({ users });

			await db.insert(users).values([
				{ name: 'Alice', age: 18 },
				{ name: 'Bob', age: 19 },
				{ name: 'Charlie', age: 20 },
				{ name: 'David', age: 21 },
				{ name: 'Eve', age: 22 },
			]);

			await expect((async () => {
				return await db.select()
					.from(users, {
						useIndex: [usersTableNameIndex],
						forceIndex: [usersTableAgeIndex],
					})
					.where(eq(users.name, 'David'));
			})()).rejects.toThrowError();
		},
	);

	test.concurrent('MySqlTable :: select with join `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_72', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_72', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_72').on(posts.userId);

		await push({ users, posts });
		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		const result = await db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: [postsTableUserIdIndex],
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			));

		expect(result).toHaveLength(1);
		expect(result).toEqual([{ userId: 4, name: 'David', postId: 4, text: 'David post' }]);
	});

	test.concurrent('MySqlTable :: select with join `use index` hint on 1 index', async ({ db, push }) => {
		const users = mysqlTable('users_73', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_73', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_73').on(posts.userId);

		await push({ users, posts });

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: postsTableUserIdIndex,
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			)).toSQL();

		expect(query.sql).to.include('USE INDEX (`posts_user_id_index_73`)');
	});

	test.concurrent('MySqlTable :: select with cross join `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_74', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_74', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_74').on(posts.userId);

		await push({ users, posts });

		await db.insert(users).values([
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
		]);

		await db.insert(posts).values([
			{ id: 1, text: 'Alice post', userId: 1 },
			{ id: 2, text: 'Bob post', userId: 2 },
		]);

		const result = await db.select()
			.from(users)
			.crossJoin(posts, {
				useIndex: [postsTableUserIdIndex],
			})
			.orderBy(users.id, posts.id);

		expect(result).toStrictEqual([{
			users_74: { id: 1, name: 'Alice' },
			posts_74: { id: 1, text: 'Alice post', userId: 1 },
		}, {
			users_74: { id: 1, name: 'Alice' },
			posts_74: { id: 2, text: 'Bob post', userId: 2 },
		}, {
			users_74: { id: 2, name: 'Bob' },
			posts_74: { id: 1, text: 'Alice post', userId: 1 },
		}, {
			users_74: { id: 2, name: 'Bob' },
			posts_74: { id: 2, text: 'Bob post', userId: 2 },
		}]);
	});

	test.concurrent('MySqlTable :: select with cross join `use index` hint on 1 index', async ({ db, push }) => {
		const users = mysqlTable('users_75', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_75', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_75').on(posts.userId);

		await push({ users, posts });

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.crossJoin(posts, {
				useIndex: postsTableUserIdIndex,
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			)).toSQL();

		expect(query.sql).to.include('USE INDEX (`posts_user_id_index_75`)');
	});

	test.concurrent('MySqlTable :: select with join `use index` hint on multiple indexes', async ({ db, push }) => {
		const users = mysqlTable('users_76', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_76', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex, postsTableTextIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_76').on(posts.userId);
		const postsTableTextIndex = index('posts_text_index_76').on(posts.text);

		await push({ users, posts });

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: [postsTableUserIdIndex, postsTableTextIndex],
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			)).toSQL();

		console.log(query.sql);
		expect(query.sql).to.include('USE INDEX (`posts_user_id_index_76`, `posts_text_index_76`)');
	});

	test.concurrent('MySqlTable :: select with join `use index` hint on not existed index', async ({ db, push }) => {
		const users = mysqlTable('users_77', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_77', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_77').on(posts.userId);

		await push({ users, posts });

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		await expect((async () => {
			return await db.select({
				userId: users.id,
				name: users.name,
				postId: posts.id,
				text: posts.text,
			})
				.from(users)
				.leftJoin(posts, eq(users.id, posts.userId), {
					useIndex: ['some_other_index'],
				})
				.where(and(
					eq(users.name, 'David'),
					eq(posts.text, 'David post'),
				));
		})()).rejects.toThrowError();
	});

	test.concurrent(
		'MySqlTable :: select with join `use index` + `force index` incompatible hints',
		async ({ db, push }) => {
			const users = mysqlTable('users_78', {
				id: serial('id').primaryKey(),
				name: varchar('name', { length: 100 }).notNull(),
			});

			const posts = mysqlTable('posts_78', {
				id: serial('id').primaryKey(),
				text: varchar('text', { length: 100 }).notNull(),
				userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, {
					onDelete: 'cascade',
				})
					.notNull(),
			}, () => [postsTableUserIdIndex, postsTableTextIndex]);
			const postsTableUserIdIndex = index('posts_user_id_index_78').on(posts.userId);
			const postsTableTextIndex = index('posts_text_index_78').on(posts.text);

			await push({ users, posts });

			await db.insert(users).values([
				{ name: 'Alice' },
				{ name: 'Bob' },
				{ name: 'Charlie' },
				{ name: 'David' },
				{ name: 'Eve' },
			]);

			await db.insert(posts).values([
				{ text: 'Alice post', userId: 1 },
				{ text: 'Bob post', userId: 2 },
				{ text: 'Charlie post', userId: 3 },
				{ text: 'David post', userId: 4 },
				{ text: 'Eve post', userId: 5 },
			]);

			await expect((async () => {
				return await db.select({
					userId: users.id,
					name: users.name,
					postId: posts.id,
					text: posts.text,
				})
					.from(users)
					.leftJoin(posts, eq(users.id, posts.userId), {
						useIndex: [postsTableUserIdIndex],
						forceIndex: [postsTableTextIndex],
					})
					.where(and(
						eq(users.name, 'David'),
						eq(posts.text, 'David post'),
					));
			})()).rejects.toThrowError();
		},
	);

	test.concurrent('MySqlTable :: select with Subquery join `use index`', async ({ db, push }) => {
		const users = mysqlTable('users_79', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_79', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_79').on(posts.userId);

		await push({ users, posts });

		await db.insert(users).values([
			{ name: 'Alice' },
			{ name: 'Bob' },
			{ name: 'Charlie' },
			{ name: 'David' },
			{ name: 'Eve' },
		]);

		await db.insert(posts).values([
			{ text: 'Alice post', userId: 1 },
			{ text: 'Bob post', userId: 2 },
			{ text: 'Charlie post', userId: 3 },
			{ text: 'David post', userId: 4 },
			{ text: 'Eve post', userId: 5 },
		]);

		const sq = db.select().from(posts, { useIndex: [postsTableUserIdIndex] }).where(eq(posts.userId, 1)).as('sq');

		const result = await db.select({
			userId: users.id,
			name: users.name,
			postId: sq.id,
			text: sq.text,
		})
			.from(users)
			.leftJoin(sq, eq(users.id, sq.userId))
			.where(eq(users.name, 'Alice'));

		expect(result).toHaveLength(1);
		expect(result).toEqual([{ userId: 1, name: 'Alice', postId: 1, text: 'Alice post' }]);
	});

	test.concurrent('MySqlTable :: select with Subquery join with `use index` in join', async ({ db, push }) => {
		const users = mysqlTable('users_80', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_80', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: bigint('user_id', { mode: 'number', unsigned: true }).references(() => users.id, { onDelete: 'cascade' })
				.notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_80').on(posts.userId);

		await push({ users, posts });

		const sq = db.select().from(posts).where(eq(posts.userId, 1)).as('sq');

		const query = db.select({
			userId: users.id,
			name: users.name,
			postId: sq.id,
			text: sq.text,
		})
			.from(users)
			// @ts-expect-error
			.leftJoin(sq, eq(users.id, sq.userId, { useIndex: [postsTableUserIdIndex] }))
			.where(eq(users.name, 'Alice'))
			.toSQL();

		expect(query.sql).not.include('USE INDEX');
	});

	test.concurrent('View :: select with `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_81', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);

		const usersTableNameIndex = index('users_name_index_81').on(users.name);

		const usersView = mysqlView('users_view_81').as((qb) => qb.select().from(users));

		await push({ users, usersView });

		// @ts-expect-error
		const query = db.select().from(usersView, {
			useIndex: [usersTableNameIndex],
		}).toSQL();

		expect(query.sql).not.include('USE INDEX');
	});

	test.concurrent('Subquery :: select with `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_82', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_82').on(users.name);

		await push({ users });

		const sq = db.select().from(users).as('sq');

		// @ts-expect-error
		const query = db.select().from(sq, {
			useIndex: [usersTableNameIndex],
		}).toSQL();

		expect(query.sql).not.include('USE INDEX');
	});

	test.concurrent('sql operator as cte', async ({ db, push }) => {
		const users = mysqlTable('users_83', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await push({ users });
		await db.insert(users).values([
			{ name: 'John' },
			{ name: 'Jane' },
		]);

		const sq1 = db.$with('sq', {
			userId: users.id,
			data: {
				name: users.name,
			},
		}).as(sql`select * from ${users} where ${users.name} = 'John'`);
		const result1 = await db.with(sq1).select().from(sq1);

		const sq2 = db.$with('sq', {
			userId: users.id,
			data: {
				name: users.name,
			},
		}).as(() => sql`select * from ${users} where ${users.name} = 'Jane'`);
		const result2 = await db.with(sq2).select().from(sq1);

		expect(result1).toEqual([{ userId: 1, data: { name: 'John' } }]);
		expect(result2).toEqual([{ userId: 2, data: { name: 'Jane' } }]);
	});

	test.concurrent('contraint names config', async ({ db, push }) => {
		const users = mysqlTable('users_84', {
			id: int('id').unique(),
			id1: int('id1').unique('custom_name'),
		});

		await push({ users });

		const tableConf = getTableConfig(users);

		expect(tableConf.columns.find((it) => it.name === 'id')!.uniqueName).toBe(undefined);
		expect(tableConf.columns.find((it) => it.name === 'id1')!.uniqueName).toBe('custom_name');
	});
}
