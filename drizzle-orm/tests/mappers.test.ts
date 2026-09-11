import { expect, test } from 'vitest';
import { AnyColumn } from '~/column';
import { SelectedFieldsOrdered } from '~/operations';
import {
	AnyPgDelete,
	AnyPgInsert,
	AnyPgSelectQueryBuilder,
	AnyPgUpdate,
	customType,
	integer,
	pgTable,
	pgView,
	text,
} from '~/pg-core';
import { drizzle, type PgliteDatabase } from '~/pglite';
import {
	type AnyRelationsBuilderConfig,
	defineRelations,
	type ExtractTablesFromSchema,
	type ExtractTablesWithRelations,
	makeDefaultRqbMapper,
	makeJitRqbMapper,
	type RelationalQueryMapperConfig,
	type RelationsBuilder,
} from '~/relations';
import { eq, max, sql } from '~/sql';
import {
	getColumns,
	getTableColumns,
	makeDefaultQueryMapper,
	makeJitQueryMapper,
	resolveNullableObjectPaths,
} from '~/utils';

function createDB<S extends Record<string, unknown>, TConfig extends AnyRelationsBuilderConfig>(
	schema: S,
	cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
): PgliteDatabase<ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>> {
	return drizzle('memory://', { relations: defineRelations(schema, cb), jit: true });
}

const testDate = new Date('2024-01-02T03:04:05.678Z');

const users = pgTable('users', (t) => ({
	id: t.bigint('id', { mode: 'number' }).primaryKey(),
	name: t.text('name').notNull(),
	createdAt: t.timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
	isBanned: t.boolean('is_banned'),
}));
const posts = pgTable('posts', (t) => ({
	id: t.integer('id').primaryKey(),
	authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
	content: t.text('content'),
}));
const internalStaff = pgTable('internal_staff_jqm1', { userId: integer('user_id').notNull().primaryKey() });
const ticket = pgTable('ticket_jqm1', { staffId: integer('staff_id').notNull() });

const loose = pgTable('loose_m', { a: text('a'), b: text('b') });
const tagged = pgTable('tagged_m', { id: text('id').primaryKey(), note: text('note') });

const db = createDB({ users, posts }, (r) => ({
	users: {
		post: r.one.posts({ from: r.users.id, to: r.posts.authorId }),
		posts: r.one.posts({ from: r.users.id, to: r.posts.authorId }),
	},
	posts: {
		author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
		authors: r.many.users({ from: r.posts.authorId, to: r.users.id }),
	},
}));

function assertPlainMapperBehaviorMatch(
	fields: SelectedFieldsOrdered<AnyColumn>,
	paths: string[] | undefined,
	data: { rawInput: unknown[][]; expectedOutput: unknown[] },
): string {
	const jit = makeJitQueryMapper<any>(fields, paths);
	const def = makeDefaultQueryMapper<any>(fields, paths);
	const clone = (rs: unknown[][]) => rs.map((r) => r.slice());
	const jitOut = jit(clone(data.rawInput));
	expect(jitOut).toStrictEqual(def(clone(data.rawInput)));
	expect(jitOut).toStrictEqual(data.expectedOutput);
	return jit.body!;
}

function selectCase(
	qb: Partial<AnyPgSelectQueryBuilder>,
	data: { rawInput: unknown[][]; expectedOutput: unknown[] },
): string {
	const fields = qb._resolveSelection!();
	return assertPlainMapperBehaviorMatch(
		fields,
		resolveNullableObjectPaths(fields, (<any> qb).joinsNotNullableMap),
		data,
	);
}

function returningCase(
	qb: Partial<AnyPgInsert | AnyPgDelete | AnyPgUpdate>,
	data: { rawInput: unknown[][]; expectedOutput: unknown[] },
): string {
	qb.getSQL!();
	return assertPlainMapperBehaviorMatch((<any> qb).config.returning, undefined, data);
}

test('Query mapper: flat select decodes each column through its codec', () => {
	expect(selectCase(db.select().from(users), {
		rawInput: [[1, 'First', testDate, true], [2, 'Second', testDate, null]],
		expectedOutput: [
			{ id: 1, name: 'First', createdAt: testDate, isBanned: true },
			{ id: 2, name: 'Second', createdAt: testDate, isBanned: null },
		],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3 ] = rows[i];
				mapped[i] = {
					"id": c0 === null ? c0 : codec0(c0, 0),
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"isBanned": c3,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: select - nothing to decode - text', () => {
	expect(selectCase(db.select({ name: users.name }).from(users), {
		rawInput: [['First']],
		expectedOutput: [{ name: 'First' }],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0 ] = rows[i];
				mapped[i] = {
					"name": c0,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: select - nothing to decode - boolean, null', () => {
	expect(selectCase(db.select({ isBanned: users.isBanned }).from(users), {
		rawInput: [[true], [null]],
		expectedOutput: [{ isBanned: true }, { isBanned: null }],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0 ] = rows[i];
				mapped[i] = {
					"isBanned": c0,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: insert/select/update/delete returning', () => {
	const rows = [[1, 'First', testDate, true]];
	const out = [{ id: 1, name: 'First', createdAt: testDate, isBanned: true }];

	expect(returningCase(db.insert(users).values([{ id: 1, name: 'First', createdAt: testDate }]).returning(), {
		rawInput: rows,
		expectedOutput: out,
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3 ] = rows[i];
				mapped[i] = {
					"id": c0 === null ? c0 : codec0(c0, 0),
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"isBanned": c3,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
	expect(selectCase(db.select().from(users), { rawInput: rows, expectedOutput: out })).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3 ] = rows[i];
				mapped[i] = {
					"id": c0 === null ? c0 : codec0(c0, 0),
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"isBanned": c3,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
	expect(returningCase(db.update(users).set({ isBanned: false }).where(eq(users.id, 2)).returning(), {
		rawInput: rows,
		expectedOutput: out,
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3 ] = rows[i];
				mapped[i] = {
					"id": c0 === null ? c0 : codec0(c0, 0),
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"isBanned": c3,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
	expect(returningCase(db.delete(users).returning(), { rawInput: rows, expectedOutput: out })).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3 ] = rows[i];
				mapped[i] = {
					"id": c0 === null ? c0 : codec0(c0, 0),
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"isBanned": c3,
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test("Query mapper: leftJoin nullifies joined group, innerJoin doesn't", () => {
	expect(selectCase(db.select({ user: users, post: posts }).from(users).leftJoin(posts, eq(users.id, posts.authorId)), {
		rawInput: [[1, 'First', testDate, true, 10, 1, 'hello'], [2, 'Second', testDate, null, null, null, null]],
		expectedOutput: [
			{
				user: { id: 1, name: 'First', createdAt: testDate, isBanned: true },
				post: { id: 10, authorId: 1, content: 'hello' },
			},
			{ user: { id: 2, name: 'Second', createdAt: testDate, isBanned: null }, post: null },
		],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			const { codec: codec5 } = columns[5];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3, c4, c5, c6 ] = rows[i];
				mapped[i] = {
					"user": {
						"id": c0 === null ? c0 : codec0(c0, 0),
						"name": c1,
						"createdAt": c2 === null ? c2 : codec2(c2, 0),
						"isBanned": c3,
					},
					"post": c4 === null && c5 === null && c6 === null ? null : {
						"id": c4,
						"authorId": c5 === null ? c5 : codec5(c5, 0),
						"content": c6,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);

	expect(
		selectCase(db.select({ user: users, post: posts }).from(users).innerJoin(posts, eq(users.id, posts.authorId)), {
			rawInput: [[2, 'Second', testDate, null, 10, 2, 'hi']],
			expectedOutput: [{
				user: { id: 2, name: 'Second', createdAt: testDate, isBanned: null },
				post: { id: 10, authorId: 2, content: 'hi' },
			}],
		}),
	).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			const { codec: codec5 } = columns[5];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3, c4, c5, c6 ] = rows[i];
				mapped[i] = {
					"user": {
						"id": c0 === null ? c0 : codec0(c0, 0),
						"name": c1,
						"createdAt": c2 === null ? c2 : codec2(c2, 0),
						"isBanned": c3,
					},
					"post": {
						"id": c4,
						"authorId": c5 === null ? c5 : codec5(c5, 0),
						"content": c6,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: custom flat selection', () => {
	const sel = {
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	};
	const rows = [[1, 10, 'First', true, 'hello', testDate]];
	const out = [{ userId: 1, postId: 10, name: 'First', isBanned: true, content: 'hello', createdAt: testDate }];
	expect(
		selectCase(db.select(sel).from(users).leftJoin(posts, eq(users.id, posts.authorId)), {
			rawInput: rows,
			expectedOutput: out,
		}),
	)
		.toMatchInlineSnapshot(`
			"function jitQueryMapper (rows) {
				"use strict";
				const { columns } = this;
				const { length } = rows;
				const mapped = new Array(length);
				const { codec: codec0 } = columns[0];
				const { codec: codec5 } = columns[5];
				for (let i = 0; i < length; ++i) {
					const [ c0, c1, c2, c3, c4, c5 ] = rows[i];
					mapped[i] = {
						"userId": c0 === null ? c0 : codec0(c0, 0),
						"postId": c1,
						"name": c2,
						"isBanned": c3,
						"content": c4,
						"createdAt": c5 === null ? c5 : codec5(c5, 0),
					};
				}
				return mapped;
				//# sourceURL=drizzle:jit-query-mapper
			}"
		`);
	expect(
		selectCase(db.select(sel).from(users).innerJoin(posts, eq(users.id, posts.authorId)), {
			rawInput: rows,
			expectedOutput: out,
		}),
	)
		.toMatchInlineSnapshot(`
			"function jitQueryMapper (rows) {
				"use strict";
				const { columns } = this;
				const { length } = rows;
				const mapped = new Array(length);
				const { codec: codec0 } = columns[0];
				const { codec: codec5 } = columns[5];
				for (let i = 0; i < length; ++i) {
					const [ c0, c1, c2, c3, c4, c5 ] = rows[i];
					mapped[i] = {
						"userId": c0 === null ? c0 : codec0(c0, 0),
						"postId": c1,
						"name": c2,
						"isBanned": c3,
						"content": c4,
						"createdAt": c5 === null ? c5 : codec5(c5, 0),
					};
				}
				return mapped;
				//# sourceURL=drizzle:jit-query-mapper
			}"
		`);
});

test("Query mapper: don't nullify group with non-null extra sql field", () => {
	const qb = db.select({
		user: { ...getTableColumns(users), extra: sql`1`.mapWith(Number).as('extra_1') },
		post: { ...getTableColumns(posts), extra: sql`1`.mapWith(Number).as('extra_1') },
	}).from(users).leftJoin(posts, eq(users.id, posts.authorId));
	expect(selectCase(qb, {
		rawInput: [[1, 'First', testDate, true, 1, 10, 1, 'hello', 1], [
			2,
			'Second',
			testDate,
			null,
			1,
			null,
			null,
			null,
			null,
		]],
		expectedOutput: [
			{
				user: { id: 1, name: 'First', createdAt: testDate, isBanned: true, extra: 1 },
				post: { id: 10, authorId: 1, content: 'hello', extra: 1 },
			},
			{ user: { id: 2, name: 'Second', createdAt: testDate, isBanned: null, extra: 1 }, post: null },
		],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			const { codec: codec2 } = columns[2];
			const { field: { sql: { decoder: decoder4 } } } = columns[4];
			const { codec: codec6 } = columns[6];
			const { field: { sql: { decoder: decoder8 } } } = columns[8];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3, c4, c5, c6, c7, c8 ] = rows[i];
				mapped[i] = {
					"user": {
						"id": c0 === null ? c0 : codec0(c0, 0),
						"name": c1,
						"createdAt": c2 === null ? c2 : codec2(c2, 0),
						"isBanned": c3,
						"extra": c4 === null ? c4 : decoder4.mapFromDriverValue(c4),
					},
					"post": c5 === null && c6 === null && c7 === null && c8 === null ? null : {
						"id": c5,
						"authorId": c6 === null ? c6 : codec6(c6, 0),
						"content": c7,
						"extra": c8 === null ? c8 : decoder8.mapFromDriverValue(c8),
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: nullify group witn nested objects', () => {
	const subq = db.select().from(internalStaff).leftJoin(users, eq(internalStaff.userId, users.id)).as('internal_staff');
	expect(selectCase(db.select().from(ticket).leftJoin(subq, eq(subq.internal_staff_jqm1.userId, ticket.staffId)), {
		rawInput: [[1, 5, 100, 'U', testDate, false], [2, null, null, null, null, null], [3, 6, null, null, null, null]],
		expectedOutput: [
			{
				ticket_jqm1: { staffId: 1 },
				internal_staff: {
					internal_staff_jqm1: { userId: 5 },
					users: { id: 100, name: 'U', createdAt: testDate, isBanned: false },
				},
			},
			{ ticket_jqm1: { staffId: 2 }, internal_staff: null },
			{
				ticket_jqm1: { staffId: 3 },
				internal_staff: {
					internal_staff_jqm1: { userId: 6 },
					users: { id: null, name: null, createdAt: null, isBanned: null },
				},
			},
		],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec2 } = columns[2];
			const { codec: codec4 } = columns[4];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3, c4, c5 ] = rows[i];
				mapped[i] = {
					"ticket_jqm1": {
						"staffId": c0,
					},
					"internal_staff": c1 === null && c2 === null && c3 === null && c4 === null && c5 === null ? null : {
						"internal_staff_jqm1": {
							"userId": c1,
						},
						"users": {
							"id": c2 === null ? c2 : codec2(c2, 0),
							"name": c3,
							"createdAt": c4 === null ? c4 : codec4(c4, 0),
							"isBanned": c5,
						},
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test("Query mapper: nullification isn't bound to `.notNull()` columns", () => {
	expect(
		selectCase(
			db.select({ u: { name: users.name }, l: { a: loose.a, b: loose.b } }).from(users).leftJoin(loose, sql`true`),
			{
				rawInput: [['First', 'x', 'y'], ['First', null, null]],
				expectedOutput: [{ u: { name: 'First' }, l: { a: 'x', b: 'y' } }, { u: { name: 'First' }, l: null }],
			},
		),
	).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2 ] = rows[i];
				mapped[i] = {
					"u": {
						"name": c0,
					},
					"l": c1 === null && c2 === null ? null : {
						"a": c1,
						"b": c2,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test("Query mapper: selection origin table isn't nullified", () => {
	expect(selectCase(db.select({ l: { a: loose.a, b: loose.b } }).from(loose), {
		rawInput: [[null, null]],
		expectedOutput: [{ l: { a: null, b: null } }],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1 ] = rows[i];
				mapped[i] = {
					"l": {
						"a": c0,
						"b": c1,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: a constant sql field keeps its group alive on a join miss', () => {
	expect(selectCase(
		db.select({ u: { name: users.name }, p: { id: tagged.id, tag: sql<string>`'x'`.as('tag') } })
			.from(users).leftJoin(tagged, sql`true`),
		{
			rawInput: [['First', null, 'x'], ['First', 't1', 'x']],
			expectedOutput: [{ u: { name: 'First' }, p: { id: null, tag: 'x' } }, {
				u: { name: 'First' },
				p: { id: 't1', tag: 'x' },
			}],
		},
	)).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2 ] = rows[i];
				mapped[i] = {
					"u": {
						"name": c0,
					},
					"p": c1 === null && c2 === null ? null : {
						"id": c1,
						"tag": c2,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: nullify all-null custom column selection group', () => {
	expect(selectCase(
		db.select({ u: { name: users.name }, p: { id: tagged.id } }).from(users).leftJoin(tagged, sql`true`),
		{
			rawInput: [['First', null], ['First', 't1']],
			expectedOutput: [{ u: { name: 'First' }, p: null }, { u: { name: 'First' }, p: { id: 't1' } }],
		},
	)).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1 ] = rows[i];
				mapped[i] = {
					"u": {
						"name": c0,
					},
					"p": c1 === null ? null : {
						"id": c1,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: cross-table group never nullified', () => {
	expect(
		selectCase(
			db.select({ g: { a: users.id, b: posts.id } }).from(users).leftJoin(posts, eq(users.id, posts.authorId)),
			{
				rawInput: [[1, null]],
				expectedOutput: [{ g: { a: 1, b: null } }],
			},
		),
	).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec0 } = columns[0];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1 ] = rows[i];
				mapped[i] = {
					"g": {
						"a": c0 === null ? c0 : codec0(c0, 0),
						"b": c1,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: sql-only group never nullified', () => {
	expect(selectCase(
		db.select({ g: { one: sql<string>`'1'`, two: sql<string>`'2'` } }).from(users).leftJoin(
			posts,
			eq(users.id, posts.authorId),
		),
		{
			rawInput: [['1', '2']],
			expectedOutput: [{ g: { one: '1', two: '2' } }],
		},
	)).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1 ] = rows[i];
				mapped[i] = {
					"g": {
						"one": c0,
						"two": c1,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: only top level group nullifies', () => {
	expect(selectCase(
		db.select({ n: users.name, c: { inner: { content: posts.content, pid: posts.id } } } as any)
			.from(users).leftJoin(posts, eq(users.id, posts.authorId)),
		{
			rawInput: [['First', 'hello', 10], ['Second', null, null]],
			expectedOutput: [{ n: 'First', c: { inner: { content: 'hello', pid: 10 } } }, { n: 'Second', c: null }],
		},
	)).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2 ] = rows[i];
				mapped[i] = {
					"n": c0,
					"c": c1 === null && c2 === null ? null : {
						"inner": {
							"content": c1,
							"pid": c2,
						},
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: joined subquery nullifies', () => {
	const crew = db.select().from(internalStaff).innerJoin(users, eq(internalStaff.userId, users.id)).as('crew_e8');
	expect(selectCase(
		db.select({ t: ticket.staffId, person: { id: crew.users.id, name: crew.users.name } })
			.from(ticket).leftJoin(crew, eq(crew.internal_staff_jqm1.userId, ticket.staffId)),
		{
			rawInput: [[1, 100, 'U'], [3, null, null]],
			expectedOutput: [{ t: 1, person: { id: 100, name: 'U' } }, { t: 3, person: null }],
		},
	)).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec1 } = columns[1];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2 ] = rows[i];
				mapped[i] = {
					"t": c0,
					"person": c1 === null && c2 === null ? null : {
						"id": c1 === null ? c1 : codec1(c1, 0),
						"name": c2,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Query mapper: never nullify without nullable paths', () => {
	const qb = db.select({ p: { id: posts.id, content: posts.content } })
		.from(users).leftJoin(posts, eq(users.id, posts.authorId));
	expect(assertPlainMapperBehaviorMatch(qb._resolveSelection(), undefined, {
		rawInput: [[null, null]],
		expectedOutput: [{ p: { id: null, content: null } }],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const [ c0, c1 ] = rows[i];
				mapped[i] = {
					"p": {
						"id": c0,
						"content": c1,
					},
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

function assertRelationalMapperBehaviorMatch(
	config: RelationalQueryMapperConfig,
	rawInput: unknown[],
	expectedOutput: unknown,
): string {
	const jit = makeJitRqbMapper(config);
	const def = makeDefaultRqbMapper(config);
	const jitOut = jit(structuredClone(rawInput) as unknown[][]);
	expect(jitOut).toStrictEqual(def(structuredClone(rawInput) as unknown[][]));
	if (expectedOutput !== undefined) expect(jitOut).toStrictEqual(expectedOutput);
	return jit.body!;
}

function rqbCustomCase(config: RelationalQueryMapperConfig, rawInput: unknown[], expectedOutput: unknown): string {
	const jit = makeJitRqbMapper(config);
	const jitOut = jit(structuredClone(rawInput) as unknown[][]);
	if (expectedOutput !== undefined) expect(jitOut).toStrictEqual(expectedOutput);
	return jit.body!;
}

function rqbObjectCase(query: any, isFirst: boolean, rawInput: unknown[], expectedOutput: unknown): string {
	return assertRelationalMapperBehaviorMatch(
		{
			selection: query._toSQL().query.selection,
			isFirst,
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: false,
			arrayModeRoot: false,
		},
		rawInput,
		expectedOutput,
	);
}

function rqbArrayCase(query: any, isFirst: boolean, rawInput: unknown[], expectedOutput?: unknown): string {
	return assertRelationalMapperBehaviorMatch(
		{
			selection: query._toSQL().query.selection,
			isFirst,
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: false,
			arrayModeRoot: true,
		},
		rawInput,
		expectedOutput,
	);
}

test('RQB object mode: empty config', () => {
	expect(
		rqbObjectCase(db.query.users.findFirst(), true, [{ id: 1, name: 'a', createdAt: testDate, isBanned: true }], {
			id: 1,
			name: 'a',
			createdAt: testDate,
			isBanned: true,
		}),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec4 } = selection[0];
			const { codec: codec5 } = selection[2];
			const row = rows[0];
			if (!row) return undefined;
			let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
			rows[0] = { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
	expect(rqbObjectCase(db.query.users.findMany(), false, [
		{ id: 1, name: 'a', createdAt: testDate, isBanned: true },
		{ id: 2, name: 'b', createdAt: testDate, isBanned: null },
	], [
		{ id: 1, name: 'a', createdAt: testDate, isBanned: true },
		{ id: 2, name: 'b', createdAt: testDate, isBanned: null },
	])).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec4 } = selection[0];
			const { codec: codec5 } = selection[2];
			for (let i = 0; i < rows.length; ++i) {
				const row = rows[i];
				let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
				rows[i] = { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
			}
			return rows;
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
	expect(rqbObjectCase(db.query.users.findFirst(), true, [], undefined)).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec4 } = selection[0];
			const { codec: codec5 } = selection[2];
			const row = rows[0];
			if (!row) return undefined;
			let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
			rows[0] = { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

test('RQB object mode: extras', () => {
	const query = db.query.users.findFirst({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});
	expect(
		rqbObjectCase(query, true, [{
			id: 1,
			name: 'a',
			createdAt: testDate,
			isBanned: true,
			sql: '1',
			sqlWrapper: '2',
		}], {
			id: 1,
			name: 'a',
			createdAt: testDate,
			isBanned: true,
			sql: 1,
			sqlWrapper: 2,
		}),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec6 } = selection[0];
			const { codec: codec7 } = selection[2];
			const { field: { decoder: dec8 } } = selection[4];
			const { field: { decoder: dec9 } } = selection[5];
			const row = rows[0];
			if (!row) return undefined;
			let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5 } = row;
			rows[0] = { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec9.mapFromDriverValue(c5) };
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

test('RQB object mode: with relations', () => {
	const query = db.query.users.findMany({ with: { post: true, posts: true } });
	const rows = [
		{ id: 1, name: 'a', createdAt: testDate, isBanned: true, post: { id: 7, authorId: 1, content: 'hi' }, posts: null },
		{ id: 2, name: 'b', createdAt: testDate, isBanned: null, post: null, posts: { id: 8, authorId: 2, content: 'yo' } },
	];
	expect(rqbObjectCase(query, false, rows, [
		{ id: 1, name: 'a', createdAt: testDate, isBanned: true, post: { id: 7, authorId: 1, content: 'hi' }, posts: null },
		{ id: 2, name: 'b', createdAt: testDate, isBanned: null, post: null, posts: { id: 8, authorId: 2, content: 'yo' } },
	])).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec6 } = selection[0];
			const { codec: codec7 } = selection[2];
			const { selection: s8 } = selection[4];
			const { codec: codec12 } = s8[1];
			const { selection: s13 } = selection[5];
			const { codec: codec17 } = s13[1];
			for (let i = 0; i < rows.length; ++i) {
				const row = rows[i];
				let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "post": c4, "posts": c5 } = row;
				if (c4 !== null) {
					let { "id": c9, "authorId": c10, "content": c11 } = c4;
					c4 = { "id": c9, "authorId": c10 === null ? null : codec12(c10, 0), "content": c11 };
				}
				if (c5 !== null) {
					let { "id": c14, "authorId": c15, "content": c16 } = c5;
					c5 = { "id": c14, "authorId": c15 === null ? null : codec17(c15, 0), "content": c16 };
				}
				rows[i] = { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "post": c4, "posts": c5 };
			}
			return rows;
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

test('RQB array mode: empty config', () => {
	expect(rqbArrayCase(db.query.users.findFirst(), true, [[1, 'a', testDate, true]], {
		id: 1,
		name: 'a',
		createdAt: testDate,
		isBanned: true,
	})).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec4 } = selection[0];
			const { codec: codec5 } = selection[2];
			const row = rows[0];
			if (!row) return undefined;
			let [ c0, c1, c2, c3 ] = row;
			return { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
	expect(rqbArrayCase(db.query.users.findMany(), false, [[1, 'a', testDate, true], [2, 'b', testDate, null]], [
		{ id: 1, name: 'a', createdAt: testDate, isBanned: true },
		{ id: 2, name: 'b', createdAt: testDate, isBanned: null },
	])).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec4 } = selection[0];
			const { codec: codec5 } = selection[2];
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const row = rows[i];
				let [ c0, c1, c2, c3 ] = row;
				mapped[i] = { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
			}
			return mapped;
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

test('RQB array mode: extras', () => {
	const query = db.query.users.findMany({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});
	expect(rqbArrayCase(query, false, [[1, 'a', testDate, true, '1', '2']], [
		{ id: 1, name: 'a', createdAt: testDate, isBanned: true, sql: 1, sqlWrapper: 2 },
	])).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec6 } = selection[0];
			const { codec: codec7 } = selection[2];
			const { field: { decoder: dec8 } } = selection[4];
			const { field: { decoder: dec9 } } = selection[5];
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const row = rows[i];
				let [ c0, c1, c2, c3, c4, c5 ] = row;
				mapped[i] = { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec9.mapFromDriverValue(c5) };
			}
			return mapped;
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

test('RQB array mode: a nested relation is a json object/array column', () => {
	const query = db.query.users.findMany({
		with: {
			post: {
				with: { authors: { extras: { sql: sql`SELECT 1`.mapWith(Number) } } },
				extras: { sql: sql`SELECT 1`.mapWith(Number) },
			},
		},
		extras: { sql: sql`SELECT 1`.mapWith(Number) },
	});
	const rows = [
		[1, 'a', testDate, true, '1', {
			id: 7,
			authorId: 1,
			content: 'hi',
			sql: '1',
			authors: [{ id: 2, name: 'b', createdAt: testDate, isBanned: null, sql: '1' }],
		}],
		[3, 'c', testDate, false, '1', null],
	];
	expect(rqbArrayCase(query, false, rows, [
		{
			id: 1,
			name: 'a',
			createdAt: testDate,
			isBanned: true,
			sql: 1,
			post: {
				id: 7,
				authorId: 1,
				content: 'hi',
				sql: 1,
				authors: [{ id: 2, name: 'b', createdAt: testDate, isBanned: null, sql: 1 }],
			},
		},
		{ id: 3, name: 'c', createdAt: testDate, isBanned: false, sql: 1, post: null },
	])).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec6 } = selection[0];
			const { codec: codec7 } = selection[2];
			const { field: { decoder: dec8 } } = selection[4];
			const { selection: s9 } = selection[5];
			const { codec: codec15 } = s9[1];
			const { field: { decoder: dec16 } } = s9[3];
			const { selection: s17 } = s9[4];
			const { codec: codec24 } = s17[0];
			const { codec: codec25 } = s17[2];
			const { field: { decoder: dec26 } } = s17[4];
			const { length } = rows;
			const mapped = new Array(length);
			for (let i = 0; i < length; ++i) {
				const row = rows[i];
				let [ c0, c1, c2, c3, c4, c5 ] = row;
				if (c5 !== null) {
					let { "id": c10, "authorId": c11, "content": c12, "sql": c13, "authors": c14 } = c5;
					if (c14 !== null) {
						for (let j18 = 0; j18 < c14.length; ++j18) {
							let { "id": c19, "name": c20, "createdAt": c21, "isBanned": c22, "sql": c23 } = c14[j18];
							c14[j18] = { "id": c19 === null ? null : codec24(c19, 0), "name": c20, "createdAt": c21 === null ? null : codec25(c21, 0), "isBanned": c22, "sql": c23 === null ? null : dec26.mapFromDriverValue(c23) };
						}
					}
					c5 = { "id": c10, "authorId": c11 === null ? null : codec15(c11, 0), "content": c12, "sql": c13 === null ? null : dec16.mapFromDriverValue(c13), "authors": c14 };
				}
				mapped[i] = { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "post": c5 };
			}
			return mapped;
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

test('RQB: extras - decoders', () => {
	const cus = customType<{ data: Date; driverData: string; jsonData: string }>({
		codec: 'timestamptz',
		dataType: () => 'timestamptz',
		forJsonSelect: (id, s) => s`${id}::text`,
		fromJson: (v) => new Date(v as string),
		toDriver: (v) => v.toISOString(),
	});
	const t = pgTable('jit_sqlw_regression', { id: integer('id').primaryKey(), c: cus('c').notNull() });
	const jsonWrapper = { getSQL: () => sql`select 1`.mapWith(t.c) };
	const numberWrapper = { getSQL: () => sql`select 1`.mapWith(Number) };
	const noopWrapper = { getSQL: () => sql`select 1` };

	const base = { parseJson: false, parseJsonIfString: false, rootJsonMappers: true, arrayModeRoot: false } as const;

	expect(
		rqbCustomCase({
			selection: [{ key: 'val', field: jsonWrapper, fieldType: 'SQLWrapper' }],
			isFirst: true,
			...base,
		}, [{
			val: '2024-01-02T03:04:05.000Z',
		}], { val: new Date('2024-01-02T03:04:05.000Z') }),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const dec1 = selection[0].field.getSQL().decoder;
			const row = rows[0];
			if (!row) return undefined;
			let { "val": c0 } = row;
			rows[0] = { "val": c0 === null ? null : dec1.mapFromJsonValue(c0) };
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
	expect(
		rqbCustomCase({
			selection: [{ key: 'val', field: jsonWrapper, fieldType: 'SQLWrapper' }],
			isFirst: false,
			...base,
		}, [{
			val: '2024-01-02T03:04:05.000Z',
		}, { val: null }], [{ val: new Date('2024-01-02T03:04:05.000Z') }, { val: null }]),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const dec1 = selection[0].field.getSQL().decoder;
			for (let i = 0; i < rows.length; ++i) {
				const row = rows[i];
				let { "val": c0 } = row;
				rows[i] = { "val": c0 === null ? null : dec1.mapFromJsonValue(c0) };
			}
			return rows;
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);

	expect(
		rqbCustomCase({
			selection: [{ key: 'val', field: numberWrapper, fieldType: 'SQLWrapper' }],
			isFirst: true,
			...base,
			rootJsonMappers: false,
		}, [{
			val: '42',
		}], { val: 42 }),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const dec1 = selection[0].field.getSQL().decoder;
			const row = rows[0];
			if (!row) return undefined;
			let { "val": c0 } = row;
			rows[0] = { "val": c0 === null ? null : dec1.mapFromDriverValue(c0) };
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);

	expect(
		rqbCustomCase({
			selection: [{ key: 'val', field: noopWrapper, fieldType: 'SQLWrapper' }],
			isFirst: true,
			...base,
		}, [{
			val: 'raw',
		}], { val: 'raw' }),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);

	expect(
		rqbCustomCase({
			selection: [{ key: 'id', field: t.id, fieldType: 'Column' }, {
				key: 'val',
				field: jsonWrapper,
				fieldType: 'SQLWrapper',
			}],
			isFirst: true,
			...base,
		}, [{
			id: 7,
			val: '2024-01-02T03:04:05.000Z',
		}], { id: 7, val: new Date('2024-01-02T03:04:05.000Z') }),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const dec2 = selection[1].field.getSQL().decoder;
			const row = rows[0];
			if (!row) return undefined;
			let { "id": c0, "val": c1 } = row;
			rows[0] = { "id": c0, "val": c1 === null ? null : dec2.mapFromJsonValue(c1) };
			return rows[0];
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);

	expect(
		rqbCustomCase(
			{
				selection: [{ key: 'val', field: jsonWrapper, fieldType: 'SQLWrapper' }],
				isFirst: true,
				...base,
				arrayModeRoot: true,
			},
			[[
				'raw',
			]],
			{ val: 'raw' },
		),
	).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const row = rows[0];
			if (!row) return undefined;
			let [ c0 ] = row;
			return { "val": c0 };
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});

const codecBypass = customType<{ data: Date; driverData: string; jsonData: string }>({
	codec: 'timestamptz',
	dataType: () => 'timestamptz(3)',
	forJsonSelect: (id, s, arrayDimensions) =>
		s`${id}::text${arrayDimensions ? s.raw('[]'.repeat(arrayDimensions)) : undefined}`,
	fromJson: (v) => new Date(v as string),
	toDriver: (v) => v.toISOString(),
});
const codecUsers = pgTable('codec_users_jit', (t) => ({
	id: t.integer().primaryKey(),
	name: t.text().notNull(),
	createdAt: t.timestamp('created_at').notNull(),
	createdAtStr: t.timestamp('created_at_str', { mode: 'string' }).notNull(),
	arrCreatedAt: t.timestamp('arr_created_at').notNull().array(),
	cus: codecBypass('cus').notNull(),
	arrCus: codecBypass('arr_cus').notNull().array(),
}));
const codecUsersView = pgView('codec_users_v_jit').as((qb) =>
	qb.select({
		...getColumns(codecUsers),
		max: max(codecUsers.createdAt).as('max'),
		maxStr: max(codecUsers.createdAtStr).as('max_str'),
		arrMax: max(codecUsers.arrCreatedAt).as('arr_max'),
		sq: qb.select({ createdAt: codecUsers.createdAt }).from(codecUsers).as('sq'),
	}).from(codecUsers).groupBy(codecUsers.id)
);
const codecDb = createDB({ codecUsers, codecUsersView }, (r) => ({
	codecUsers: { self: r.one.codecUsers({ from: r.codecUsers.id, to: r.codecUsers.id }) },
	codecUsersView: { self: r.one.codecUsersView({ from: r.codecUsersView.id, to: r.codecUsersView.id }) },
}));

const nulls = (n: number) => [Array.from({ length: n }, () => null)];

test('Column as decoder: a select with aggregates and a subquery resolves each column codec', () => {
	const qb = codecDb.select({
		...getColumns(codecUsers),
		max: max(codecUsers.createdAt).as('max'),
		maxStr: max(codecUsers.createdAtStr).as('max_str'),
		arrMax: max(codecUsers.arrCreatedAt).as('arr_max'),
		sq: codecDb.select({ createdAt: codecUsers.createdAt }).from(codecUsers).as('sq'),
	}).from(codecUsers).groupBy(codecUsers.id);
	const fields = qb._resolveSelection();
	expect(assertPlainMapperBehaviorMatch(fields, resolveNullableObjectPaths(fields, (<any> qb).joinsNotNullableMap), {
		rawInput: nulls(11),
		expectedOutput: [{
			id: null,
			name: null,
			createdAt: null,
			createdAtStr: null,
			arrCreatedAt: null,
			cus: null,
			arrCus: null,
			max: null,
			maxStr: null,
			arrMax: null,
			sq: null,
		}],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec2 } = columns[2];
			const { codec: codec4 } = columns[4];
			const { codec: codec5 } = columns[5];
			const { codec: codec6 } = columns[6];
			const { codec: codec7 } = columns[7];
			const { codec: codec9 } = columns[9];
			const { codec: codec10 } = columns[10];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10 ] = rows[i];
				mapped[i] = {
					"id": c0,
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"createdAtStr": c3,
					"arrCreatedAt": c4 === null ? c4 : codec4(c4, 1),
					"cus": c5 === null ? c5 : codec5(c5, 0),
					"arrCus": c6 === null ? c6 : codec6(c6, 1),
					"max": c7 === null ? c7 : codec7(c7, 0),
					"maxStr": c8,
					"arrMax": c9 === null ? c9 : codec9(c9, 1),
					"sq": c10 === null ? c10 : codec10(c10, 0),
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Column as decoder: a view over select resolves the same codecs', () => {
	expect(selectCase(codecDb.select().from(codecUsersView), {
		rawInput: nulls(11),
		expectedOutput: [{
			id: null,
			name: null,
			createdAt: null,
			createdAtStr: null,
			arrCreatedAt: null,
			cus: null,
			arrCus: null,
			max: null,
			maxStr: null,
			arrMax: null,
			sq: null,
		}],
	})).toMatchInlineSnapshot(`
		"function jitQueryMapper (rows) {
			"use strict";
			const { columns } = this;
			const { length } = rows;
			const mapped = new Array(length);
			const { codec: codec2 } = columns[2];
			const { codec: codec4 } = columns[4];
			const { codec: codec5 } = columns[5];
			const { codec: codec6 } = columns[6];
			const { codec: codec7 } = columns[7];
			const { codec: codec9 } = columns[9];
			const { codec: codec10 } = columns[10];
			for (let i = 0; i < length; ++i) {
				const [ c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10 ] = rows[i];
				mapped[i] = {
					"id": c0,
					"name": c1,
					"createdAt": c2 === null ? c2 : codec2(c2, 0),
					"createdAtStr": c3,
					"arrCreatedAt": c4 === null ? c4 : codec4(c4, 1),
					"cus": c5 === null ? c5 : codec5(c5, 0),
					"arrCus": c6 === null ? c6 : codec6(c6, 1),
					"max": c7 === null ? c7 : codec7(c7, 0),
					"maxStr": c8,
					"arrMax": c9 === null ? c9 : codec9(c9, 1),
					"sq": c10 === null ? c10 : codec10(c10, 0),
				};
			}
			return mapped;
			//# sourceURL=drizzle:jit-query-mapper
		}"
	`);
});

test('Column as decoder: in-JSON codec bypass', () => {
	const query = codecDb.query.codecUsers.findFirst({
		with: {
			self: {
				extras: {
					max: () => sql`select max(${codecUsers.createdAt}) from ${codecUsers}`.mapWith(codecUsers.createdAt),
				},
			},
		},
		extras: { max: () => sql`select max(${codecUsers.createdAt}) from ${codecUsers}`.mapWith(codecUsers.createdAt) },
	});
	expect(rqbArrayCase(query, true, [[null, null, null, null, null, null, null, null, null]], undefined))
		.toMatchInlineSnapshot(`
			"function jitRqbMapper (rows) {
				"use strict";
				const { selection } = this;
				const { codec: codec9 } = selection[2];
				const { codec: codec10 } = selection[4];
				const { codec: codec11 } = selection[5];
				const { codec: codec12 } = selection[6];
				const { codec: codec13 } = selection[7];
				const { selection: s14 } = selection[8];
				const { codec: codec23 } = s14[2];
				const { codec: codec24 } = s14[4];
				const { field: dec25 } = s14[5];
				const { field: dec26 } = s14[6];
				const { codec: codec27 } = s14[7];
				const row = rows[0];
				if (!row) return undefined;
				let [ c0, c1, c2, c3, c4, c5, c6, c7, c8 ] = row;
				if (c8 !== null) {
					let { "id": c15, "name": c16, "createdAt": c17, "createdAtStr": c18, "arrCreatedAt": c19, "cus": c20, "arrCus": c21, "max": c22 } = c8;
					c8 = { "id": c15, "name": c16, "createdAt": c17 === null ? null : codec23(c17, 0), "createdAtStr": c18, "arrCreatedAt": c19 === null ? null : codec24(c19, 1), "cus": c20 === null ? null : dec25.mapFromJsonValue(c20), "arrCus": c21 === null ? null : dec26.mapFromJsonValue(c21), "max": c22 === null ? null : codec27(c22, 0) };
				}
				return { "id": c0, "name": c1, "createdAt": c2 === null ? null : codec9(c2, 0), "createdAtStr": c3, "arrCreatedAt": c4 === null ? null : codec10(c4, 1), "cus": c5 === null ? null : codec11(c5, 0), "arrCus": c6 === null ? null : codec12(c6, 1), "max": c7 === null ? null : codec13(c7, 0), "self": c8 };
				//# sourceURL=drizzle:jit-relational-query-mapper
			}"
		`);
});

test('Column as decoder: in-JSON codec-bypass - view', () => {
	const query = codecDb.query.codecUsersView.findFirst({
		columns: { sq: false },
		with: { self: { columns: { sq: false } } },
	});
	expect(rqbArrayCase(query, true, [Array.from({ length: 11 }, () => null)], undefined)).toMatchInlineSnapshot(`
		"function jitRqbMapper (rows) {
			"use strict";
			const { selection } = this;
			const { codec: codec11 } = selection[2];
			const { codec: codec12 } = selection[4];
			const { codec: codec13 } = selection[5];
			const { codec: codec14 } = selection[6];
			const { codec: codec15 } = selection[7];
			const { codec: codec16 } = selection[9];
			const { selection: s17 } = selection[10];
			const { codec: codec28 } = s17[2];
			const { codec: codec29 } = s17[4];
			const { field: dec30 } = s17[5];
			const { field: dec31 } = s17[6];
			const { codec: codec32 } = s17[7];
			const { codec: codec33 } = s17[9];
			const row = rows[0];
			if (!row) return undefined;
			let [ c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10 ] = row;
			if (c10 !== null) {
				let { "id": c18, "name": c19, "createdAt": c20, "createdAtStr": c21, "arrCreatedAt": c22, "cus": c23, "arrCus": c24, "max": c25, "maxStr": c26, "arrMax": c27 } = c10;
				c10 = { "id": c18, "name": c19, "createdAt": c20 === null ? null : codec28(c20, 0), "createdAtStr": c21, "arrCreatedAt": c22 === null ? null : codec29(c22, 1), "cus": c23 === null ? null : dec30.mapFromJsonValue(c23), "arrCus": c24 === null ? null : dec31.mapFromJsonValue(c24), "max": c25 === null ? null : codec32(c25, 0), "maxStr": c26, "arrMax": c27 === null ? null : codec33(c27, 1) };
			}
			return { "id": c0, "name": c1, "createdAt": c2 === null ? null : codec11(c2, 0), "createdAtStr": c3, "arrCreatedAt": c4 === null ? null : codec12(c4, 1), "cus": c5 === null ? null : codec13(c5, 0), "arrCus": c6 === null ? null : codec14(c6, 1), "max": c7 === null ? null : codec15(c7, 0), "maxStr": c8, "arrMax": c9 === null ? null : codec16(c9, 1), "self": c10 };
			//# sourceURL=drizzle:jit-relational-query-mapper
		}"
	`);
});
