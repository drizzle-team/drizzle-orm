/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
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
import { type Test } from './instrumentation';
import { allTypesTable } from './schema2';

export function tests(vendor: 'mysql' | 'planetscale', test: Test, exclude: Set<string> = new Set<string>([])) {
	test.beforeEach(async ({ task, skip }) => {
		if (exclude.has(task.name)) skip();
	});

	test('all types', async ({ db }) => {
		await db.insert(allTypesTable).values({
			serial: 1,
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
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

	test.only('insert into ... select', async ({ db, push }) => {
		const notifications = mysqlTable('notifications_29', {
			id: int('id').primaryKey().autoincrement(),
			sentAt: timestamp('sent_at').notNull().defaultNow(),
			message: text('message').notNull(),
		});
		const users = mysqlTable('users_29', {
			id: int('id').primaryKey().autoincrement(),
			name: text('name').notNull(),
		});
		const userNotications = mysqlTable('user_notifications_29', {
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

	test('insert into ... select with keys in different order', async ({ db }) => {
		const users1 = mysqlTable('users1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});
		const users2 = mysqlTable('users2', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${users1}`);
		await db.execute(sql`drop table if exists ${users2}`);
		await db.execute(sql`
			create table ${users1} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`);
		await db.execute(sql`
			create table ${users2} (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`);

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

	test('MySqlTable :: select with `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_30', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_30').on(users.name);

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

	test('MySqlTable :: select with `use index` hint on 1 index', async ({ db }) => {
		const users = mysqlTable('users_31', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_31').on(users.name);

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`
			create table ${users} (
				\`id\` serial primary key,
				\`name\` varchar(100) not null
			)
		`);
		await db.execute(sql`create index users_name_index_30 ON users_32(name)`);

		const query = db.select()
			.from(users, {
				useIndex: usersTableNameIndex,
			})
			.where(eq(users.name, 'David'))
			.toSQL();

		expect(query.sql).to.include('USE INDEX (users_name_index_31)');
	});

	test('MySqlTable :: select with `use index` hint on multiple indexes', async ({ db, push }) => {
		const users = mysqlTable('users_32', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
			age: int('age').notNull(),
		}, () => [usersTableNameIndex, usersTableAgeIndex]);
		const usersTableNameIndex = index('users_name_index_32').on(users.name);
		const usersTableAgeIndex = index('users_age_index_32').on(users.age);

		await push({ users });

		const query = db.select()
			.from(users, {
				useIndex: [usersTableNameIndex, usersTableAgeIndex],
			})
			.where(eq(users.name, 'David'))
			.toSQL();

		expect(query.sql).to.include('USE INDEX (users_name_index_32, users_age_index_32)');
	});

	test('MySqlTable :: select with `use index` hint on not existed index', async ({ db, push }) => {
		const users = mysqlTable('users_33', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_33').on(users.name);

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

	test('MySqlTable :: select with `use index` + `force index` incompatible hints', async ({ db, push }) => {
		const users = mysqlTable('users_34', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
			age: int('age').notNull(),
		}, () => [usersTableNameIndex, usersTableAgeIndex]);
		const usersTableNameIndex = index('users_name_index_34').on(users.name);
		const usersTableAgeIndex = index('users_age_index_34').on(users.age);

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
	});

	test('MySqlTable :: select with join `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_35', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_35', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_35').on(posts.userId);

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

	test('MySqlTable :: select with join `use index` hint on 1 index', async ({ db, push }) => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index35').on(posts.userId);

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

		expect(query.sql).to.include('USE INDEX (posts_user_id_index_35)');
	});

	test('MySqlTable :: select with cross join `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_36', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_36', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_36').on(posts.userId);

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
			users: { id: 1, name: 'Alice' },
			posts: { id: 1, text: 'Alice post', userId: 1 },
		}, {
			users: { id: 1, name: 'Alice' },
			posts: { id: 2, text: 'Bob post', userId: 2 },
		}, {
			users: { id: 2, name: 'Bob' },
			posts: { id: 1, text: 'Alice post', userId: 1 },
		}, {
			users: { id: 2, name: 'Bob' },
			posts: { id: 2, text: 'Bob post', userId: 2 },
		}]);
	});

	test('MySqlTable :: select with cross join `use index` hint on 1 index', async ({ db, push }) => {
		const users = mysqlTable('users_37', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_37', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_37').on(posts.userId);

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

		expect(query.sql).to.include('USE INDEX (posts_user_id_index_37)');
	});

	test('MySqlTable :: select with join `use index` hint on multiple indexes', async ({ db, push }) => {
		const users = mysqlTable('users_38', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_38', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex, postsTableTextIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_38').on(posts.userId);
		const postsTableTextIndex = index('posts_text_index_38').on(posts.text);

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

		expect(query.sql).to.include('USE INDEX (posts_user_id_index_38, posts_text_index_38)');
	});

	test('MySqlTable :: select with join `use index` hint on not existed index', async ({ db, push }) => {
		const users = mysqlTable('users_39', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_39', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_39').on(posts.userId);

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

	test('MySqlTable :: select with join `use index` + `force index` incompatible hints', async ({ db, push }) => {
		const users = mysqlTable('users_40', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_40', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex, postsTableTextIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_40').on(posts.userId);
		const postsTableTextIndex = index('posts_text_index_40').on(posts.text);

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
	});

	test('MySqlTable :: select with Subquery join `use index`', async ({ db, push }) => {
		const users = mysqlTable('users_41', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_41', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_41').on(posts.userId);

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

	test('MySqlTable :: select with Subquery join with `use index` in join', async ({ db, push }) => {
		const users = mysqlTable('users_42', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		});

		const posts = mysqlTable('posts_42', {
			id: serial('id').primaryKey(),
			text: varchar('text', { length: 100 }).notNull(),
			userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
		}, () => [postsTableUserIdIndex]);
		const postsTableUserIdIndex = index('posts_user_id_index_42').on(posts.userId);

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

	test('View :: select with `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_43', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);

		const usersTableNameIndex = index('users_name_index_43').on(users.name);

		const usersView = mysqlView('users_view_43').as((qb) => qb.select().from(users));

		await push({ users });
		await db.execute(sql`create view ${usersView} as select * from ${users}`);

		// @ts-expect-error
		const query = db.select().from(usersView, {
			useIndex: [usersTableNameIndex],
		}).toSQL();

		expect(query.sql).not.include('USE INDEX');

		await db.execute(sql`drop view ${usersView}`);
	});

	test('Subquery :: select with `use index` hint', async ({ db, push }) => {
		const users = mysqlTable('users_44', {
			id: serial('id').primaryKey(),
			name: varchar('name', { length: 100 }).notNull(),
		}, () => [usersTableNameIndex]);
		const usersTableNameIndex = index('users_name_index_44').on(users.name);

		await push({ users });

		const sq = db.select().from(users).as('sq');

		// @ts-expect-error
		const query = db.select().from(sq, {
			useIndex: [usersTableNameIndex],
		}).toSQL();

		expect(query.sql).not.include('USE INDEX');
	});

	test('sql operator as cte', async ({ db, push }) => {
		const users = mysqlTable('users_45', {
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

	test('contraint names config', async ({ db, push }) => {
		const users = mysqlTable('users_46', {
			id: int('id').unique(),
			id1: int('id1').unique('custom_name'),
		});

		await push({ users });

		const tableConf = getTableConfig(users);

		expect(tableConf.columns.find((it) => it.name === 'id')!.uniqueName).toBe(undefined);
		expect(tableConf.columns.find((it) => it.name === 'id1')!.uniqueName).toBe('custom_name');
	});
}
