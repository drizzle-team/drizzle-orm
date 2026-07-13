import { expect, test } from 'vitest';
import { customType, integer, pgTable, pgView } from '~/pg-core';
import { drizzle, PgliteDatabase } from '~/pglite';
import {
	AnyRelationsBuilderConfig,
	defineRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	makeJitRqbMapper,
	RelationsBuilder,
} from '~/relations';
import { eq, max, sql } from '~/sql';
import { getColumns, getTableColumns } from '~/utils';

function createDB<S extends Record<string, unknown>, TConfig extends AnyRelationsBuilderConfig>(
	schema: S,
	cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
): PgliteDatabase<ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>> {
	return drizzle('memory://', {
		relations: defineRelations(schema, cb),
		jit: true,
	});
}

const users = pgTable('users', (t) => ({
	id: t.bigint('id', { mode: 'number' }).primaryKey(),
	name: t.text('name').notNull(),
	createdAt: t.timestamp('created_at', {
		withTimezone: true,
		mode: 'date',
	}).notNull(),
	isBanned: t.boolean('is_banned'),
}));

const posts = pgTable('posts', (t) => ({
	id: t.integer('id').primaryKey(),
	authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
	content: t.text('content'),
}));

const internalStaff = pgTable('internal_staff_jqm1', {
	userId: integer('user_id').notNull().primaryKey(),
});

const ticket = pgTable('ticket_jqm1', {
	staffId: integer('staff_id').notNull(),
});

const db = createDB({ users, posts }, (r) => ({
	users: {
		post: r.one.posts({
			from: r.users.id,
			to: r.posts.authorId,
		}),
		posts: r.one.posts({
			from: r.users.id,
			to: r.posts.authorId,
		}),
	},
	posts: {
		author: r.one.users({
			from: r.posts.authorId,
			to: r.users.id,
		}),
		authors: r.many.users({
			from: r.posts.authorId,
			to: r.users.id,
		}),
	},
}));

test('Jit mappers: simple select', async () => {
	expect(db.select().from(users).prepare().mapper?.body).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
});

test('Jit mappers: select - nothing to decode - text', async () => {
	expect(db.select({ name: users.name }).from(users).prepare().mapper?.body).toStrictEqual(
		`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const [ c0 ] = rows[i];
		mapped[i] = {
			"name": c0,
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`,
	);
});

test('Jit mappers: select - nothing to decode - null', async () => {
	expect(db.select({ isBanned: users.isBanned }).from(users).prepare().mapper?.body).toStrictEqual(
		`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const [ c0 ] = rows[i];
		mapped[i] = {
			"isBanned": c0,
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`,
	);
});

test('Jit mappers: insert returning all, select, update returning, delete returning', async () => {
	const inserted = db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: new Date(),
	}, {
		id: 2,
		name: 'Second',
		createdAt: new Date(),
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: new Date(),
	}]).returning().prepare().mapper?.body;

	const selected = db.select().from(users).prepare().mapper?.body;

	const updated = db.update(users).set({
		isBanned: false,
	}).where(eq(users.id, 2)).returning().prepare().mapper?.body;

	const deleted = db.delete(users).returning().prepare().mapper?.body;

	expect(inserted).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(selected).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(updated).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(deleted).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
});

test('Jit mappers: select complex selections', async () => {
	const selected1 = db.select({ user: users, post: posts }).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	).prepare().mapper?.body;
	const selected2 = db.select({ user: users, post: posts }).from(users).innerJoin(
		posts,
		eq(users.id, posts.authorId),
	).prepare().mapper?.body;
	const selected3 = db.select({
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	}).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	).prepare().mapper?.body;
	const selected4 = db.select({
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	}).from(users).innerJoin(
		posts,
		eq(users.id, posts.authorId),
	).prepare().mapper?.body;
	const selected5 = db.select({
		user: {
			...getTableColumns(users),
			extra: sql`1`.mapWith(Number).as('extra_1'),
		},
		post: {
			...getTableColumns(posts),
			extra: sql`1`.mapWith(Number).as('extra_1'),
		},
	}).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	).prepare().mapper?.body;
	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(users, eq(internalStaff.userId, users.id))
		.as('internal_staff');
	const selected6 = db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff_jqm1.userId, ticket.staffId))
		.prepare().mapper?.body;

	expect(selected1).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(selected2).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(selected3).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(selected4).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
	expect(selected5).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
			"post": c5 === null && c6 === null && c7 === null ? null : {
				"id": c5,
				"authorId": c6 === null ? c6 : codec6(c6, 0),
				"content": c7,
				"extra": c8 === null ? c8 : decoder8.mapFromDriverValue(c8),
			},
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected6).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { codec: codec2 } = columns[2];
	const { codec: codec4 } = columns[4];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3, c4, c5 ] = rows[i];
		mapped[i] = {
			"ticket_jqm1": {
				"staffId": c0,
			},
			"internal_staff": {
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
}`);
});

test('Jit mappers: relational - object mode', async () => {
	const bodyForObjectRoot = (q: unknown, isFirst: boolean) => {
		const selection = (q as any)._toSQL().query.selection;
		return makeJitRqbMapper({
			selection,
			isFirst,
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: false,
			arrayModeRoot: false,
		}).body;
	};

	const empty1 = bodyForObjectRoot(db.query.users.findFirst(), true);
	const empty2 = bodyForObjectRoot(db.query.users.findMany(), false);

	expect(empty1).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);
	expect(empty2).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);

	const simple1 = bodyForObjectRoot(db.query.users.findFirst(), true);
	const simple2 = bodyForObjectRoot(db.query.users.findMany(), false);

	expect(simple1).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);
	expect(simple2).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);

	const extra1 = bodyForObjectRoot(
		db.query.users.findFirst({
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		}),
		true,
	);
	const extra2 = bodyForObjectRoot(
		db.query.users.findMany({
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		}),
		false,
	);

	expect(extra1).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);
	expect(extra2).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec6 } = selection[0];
	const { codec: codec7 } = selection[2];
	const { field: { decoder: dec8 } } = selection[4];
	const { field: { decoder: dec9 } } = selection[5];
	for (let i = 0; i < rows.length; ++i) {
		const row = rows[i];
		let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5 } = row;
		rows[i] = { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec9.mapFromDriverValue(c5) };
	}
	return rows;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const nested1 = bodyForObjectRoot(
		db.query.users.findFirst({
			with: {
				post: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
				posts: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
			},
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		}),
		true,
	);
	const nested2 = bodyForObjectRoot(
		db.query.users.findMany({
			with: {
				post: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
							where: {
								RAW: sql`false`,
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
				posts: {
					with: {
						author: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
						authors: {
							extras: {
								sql: sql`SELECT 1`.mapWith(Number),
								sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
							},
						},
					},
					extras: {
						sql: sql`SELECT 1`.mapWith(Number),
						sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
					},
				},
			},
			extras: {
				sql: sql`SELECT 1`.mapWith(Number),
				sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
			},
		}),
		false,
	);

	expect(nested1).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec8 } = selection[0];
	const { codec: codec9 } = selection[2];
	const { field: { decoder: dec10 } } = selection[4];
	const { field: { decoder: dec11 } } = selection[5];
	const { selection: s12 } = selection[6];
	const { codec: codec20 } = s12[1];
	const { field: { decoder: dec21 } } = s12[3];
	const { field: { decoder: dec22 } } = s12[4];
	const { selection: s23 } = s12[5];
	const { codec: codec30 } = s23[0];
	const { codec: codec31 } = s23[2];
	const { field: { decoder: dec32 } } = s23[4];
	const { field: { decoder: dec33 } } = s23[5];
	const { selection: s34 } = s12[6];
	const { codec: codec42 } = s34[0];
	const { codec: codec43 } = s34[2];
	const { field: { decoder: dec44 } } = s34[4];
	const { field: { decoder: dec45 } } = s34[5];
	const { selection: s46 } = selection[7];
	const { codec: codec54 } = s46[1];
	const { field: { decoder: dec55 } } = s46[3];
	const { field: { decoder: dec56 } } = s46[4];
	const { selection: s57 } = s46[5];
	const { codec: codec64 } = s57[0];
	const { codec: codec65 } = s57[2];
	const { field: { decoder: dec66 } } = s57[4];
	const { field: { decoder: dec67 } } = s57[5];
	const { selection: s68 } = s46[6];
	const { codec: codec76 } = s68[0];
	const { codec: codec77 } = s68[2];
	const { field: { decoder: dec78 } } = s68[4];
	const { field: { decoder: dec79 } } = s68[5];
	const row = rows[0];
	if (!row) return undefined;
	let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5, "post": c6, "posts": c7 } = row;
	if (c6 !== null) {
		let { "id": c13, "authorId": c14, "content": c15, "sql": c16, "sqlWrapper": c17, "author": c18, "authors": c19 } = c6;
		if (c18 !== null) {
			let { "id": c24, "name": c25, "createdAt": c26, "isBanned": c27, "sql": c28, "sqlWrapper": c29 } = c18;
			c18 = { "id": c24 === null ? null : codec30(c24, 0), "name": c25, "createdAt": c26 === null ? null : codec31(c26, 0), "isBanned": c27, "sql": c28 === null ? null : dec32.mapFromDriverValue(c28), "sqlWrapper": c29 === null ? null : dec33.mapFromDriverValue(c29) };
		}
		if (c19 !== null) {
			for (let j35 = 0; j35 < c19.length; ++j35) {
				let { "id": c36, "name": c37, "createdAt": c38, "isBanned": c39, "sql": c40, "sqlWrapper": c41 } = c19[j35];
				c19[j35] = { "id": c36 === null ? null : codec42(c36, 0), "name": c37, "createdAt": c38 === null ? null : codec43(c38, 0), "isBanned": c39, "sql": c40 === null ? null : dec44.mapFromDriverValue(c40), "sqlWrapper": c41 === null ? null : dec45.mapFromDriverValue(c41) };
			}
		}
		c6 = { "id": c13, "authorId": c14 === null ? null : codec20(c14, 0), "content": c15, "sql": c16 === null ? null : dec21.mapFromDriverValue(c16), "sqlWrapper": c17 === null ? null : dec22.mapFromDriverValue(c17), "author": c18, "authors": c19 };
	}
	if (c7 !== null) {
		let { "id": c47, "authorId": c48, "content": c49, "sql": c50, "sqlWrapper": c51, "author": c52, "authors": c53 } = c7;
		if (c52 !== null) {
			let { "id": c58, "name": c59, "createdAt": c60, "isBanned": c61, "sql": c62, "sqlWrapper": c63 } = c52;
			c52 = { "id": c58 === null ? null : codec64(c58, 0), "name": c59, "createdAt": c60 === null ? null : codec65(c60, 0), "isBanned": c61, "sql": c62 === null ? null : dec66.mapFromDriverValue(c62), "sqlWrapper": c63 === null ? null : dec67.mapFromDriverValue(c63) };
		}
		if (c53 !== null) {
			for (let j69 = 0; j69 < c53.length; ++j69) {
				let { "id": c70, "name": c71, "createdAt": c72, "isBanned": c73, "sql": c74, "sqlWrapper": c75 } = c53[j69];
				c53[j69] = { "id": c70 === null ? null : codec76(c70, 0), "name": c71, "createdAt": c72 === null ? null : codec77(c72, 0), "isBanned": c73, "sql": c74 === null ? null : dec78.mapFromDriverValue(c74), "sqlWrapper": c75 === null ? null : dec79.mapFromDriverValue(c75) };
			}
		}
		c7 = { "id": c47, "authorId": c48 === null ? null : codec54(c48, 0), "content": c49, "sql": c50 === null ? null : dec55.mapFromDriverValue(c50), "sqlWrapper": c51 === null ? null : dec56.mapFromDriverValue(c51), "author": c52, "authors": c53 };
	}
	rows[0] = { "id": c0 === null ? null : codec8(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec9(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec10.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec11.mapFromDriverValue(c5), "post": c6, "posts": c7 };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(nested2).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec8 } = selection[0];
	const { codec: codec9 } = selection[2];
	const { field: { decoder: dec10 } } = selection[4];
	const { field: { decoder: dec11 } } = selection[5];
	const { selection: s12 } = selection[6];
	const { codec: codec20 } = s12[1];
	const { field: { decoder: dec21 } } = s12[3];
	const { field: { decoder: dec22 } } = s12[4];
	const { selection: s23 } = s12[5];
	const { codec: codec30 } = s23[0];
	const { codec: codec31 } = s23[2];
	const { field: { decoder: dec32 } } = s23[4];
	const { field: { decoder: dec33 } } = s23[5];
	const { selection: s34 } = s12[6];
	const { codec: codec42 } = s34[0];
	const { codec: codec43 } = s34[2];
	const { field: { decoder: dec44 } } = s34[4];
	const { field: { decoder: dec45 } } = s34[5];
	const { selection: s46 } = selection[7];
	const { codec: codec54 } = s46[1];
	const { field: { decoder: dec55 } } = s46[3];
	const { field: { decoder: dec56 } } = s46[4];
	const { selection: s57 } = s46[5];
	const { codec: codec64 } = s57[0];
	const { codec: codec65 } = s57[2];
	const { field: { decoder: dec66 } } = s57[4];
	const { field: { decoder: dec67 } } = s57[5];
	const { selection: s68 } = s46[6];
	const { codec: codec76 } = s68[0];
	const { codec: codec77 } = s68[2];
	const { field: { decoder: dec78 } } = s68[4];
	const { field: { decoder: dec79 } } = s68[5];
	for (let i = 0; i < rows.length; ++i) {
		const row = rows[i];
		let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5, "post": c6, "posts": c7 } = row;
		if (c6 !== null) {
			let { "id": c13, "authorId": c14, "content": c15, "sql": c16, "sqlWrapper": c17, "author": c18, "authors": c19 } = c6;
			if (c18 !== null) {
				let { "id": c24, "name": c25, "createdAt": c26, "isBanned": c27, "sql": c28, "sqlWrapper": c29 } = c18;
				c18 = { "id": c24 === null ? null : codec30(c24, 0), "name": c25, "createdAt": c26 === null ? null : codec31(c26, 0), "isBanned": c27, "sql": c28 === null ? null : dec32.mapFromDriverValue(c28), "sqlWrapper": c29 === null ? null : dec33.mapFromDriverValue(c29) };
			}
			if (c19 !== null) {
				for (let j35 = 0; j35 < c19.length; ++j35) {
					let { "id": c36, "name": c37, "createdAt": c38, "isBanned": c39, "sql": c40, "sqlWrapper": c41 } = c19[j35];
					c19[j35] = { "id": c36 === null ? null : codec42(c36, 0), "name": c37, "createdAt": c38 === null ? null : codec43(c38, 0), "isBanned": c39, "sql": c40 === null ? null : dec44.mapFromDriverValue(c40), "sqlWrapper": c41 === null ? null : dec45.mapFromDriverValue(c41) };
				}
			}
			c6 = { "id": c13, "authorId": c14 === null ? null : codec20(c14, 0), "content": c15, "sql": c16 === null ? null : dec21.mapFromDriverValue(c16), "sqlWrapper": c17 === null ? null : dec22.mapFromDriverValue(c17), "author": c18, "authors": c19 };
		}
		if (c7 !== null) {
			let { "id": c47, "authorId": c48, "content": c49, "sql": c50, "sqlWrapper": c51, "author": c52, "authors": c53 } = c7;
			if (c52 !== null) {
				let { "id": c58, "name": c59, "createdAt": c60, "isBanned": c61, "sql": c62, "sqlWrapper": c63 } = c52;
				c52 = { "id": c58 === null ? null : codec64(c58, 0), "name": c59, "createdAt": c60 === null ? null : codec65(c60, 0), "isBanned": c61, "sql": c62 === null ? null : dec66.mapFromDriverValue(c62), "sqlWrapper": c63 === null ? null : dec67.mapFromDriverValue(c63) };
			}
			if (c53 !== null) {
				for (let j69 = 0; j69 < c53.length; ++j69) {
					let { "id": c70, "name": c71, "createdAt": c72, "isBanned": c73, "sql": c74, "sqlWrapper": c75 } = c53[j69];
					c53[j69] = { "id": c70 === null ? null : codec76(c70, 0), "name": c71, "createdAt": c72 === null ? null : codec77(c72, 0), "isBanned": c73, "sql": c74 === null ? null : dec78.mapFromDriverValue(c74), "sqlWrapper": c75 === null ? null : dec79.mapFromDriverValue(c75) };
				}
			}
			c7 = { "id": c47, "authorId": c48 === null ? null : codec54(c48, 0), "content": c49, "sql": c50 === null ? null : dec55.mapFromDriverValue(c50), "sqlWrapper": c51 === null ? null : dec56.mapFromDriverValue(c51), "author": c52, "authors": c53 };
		}
		rows[i] = { "id": c0 === null ? null : codec8(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec9(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec10.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec11.mapFromDriverValue(c5), "post": c6, "posts": c7 };
	}
	return rows;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
});

test('Jit mappers: relational - array mode', async () => {
	const empty1 = db.query.users.findFirst().prepare().mapper?.body;
	const empty2 = db.query.users.findMany().prepare().mapper?.body;

	expect(empty1).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec4 } = selection[0];
	const { codec: codec5 } = selection[2];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3 ] = row;
	return { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(empty2).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec4 } = selection[0];
	const { codec: codec5 } = selection[2];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3 ] = row;
		mapped[i] = { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const simple1 = db.query.users.findFirst().prepare().mapper?.body;
	const simple2 = db.query.users.findMany().prepare().mapper?.body;

	expect(simple1).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec4 } = selection[0];
	const { codec: codec5 } = selection[2];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3 ] = row;
	return { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(simple2).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec4 } = selection[0];
	const { codec: codec5 } = selection[2];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3 ] = row;
		mapped[i] = { "id": c0 === null ? null : codec4(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec5(c2, 0), "isBanned": c3 };
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const extras1 = db.query.users.findFirst({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	}).prepare().mapper?.body;
	const extras2 = db.query.users.findMany({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	}).prepare().mapper?.body;

	expect(extras1).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec6 } = selection[0];
	const { codec: codec7 } = selection[2];
	const { field: { decoder: dec8 } } = selection[4];
	const { field: { decoder: dec9 } } = selection[5];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3, c4, c5 ] = row;
	return { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec9.mapFromDriverValue(c5) };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(extras2).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec6 } = selection[0];
	const { codec: codec7 } = selection[2];
	const { field: { decoder: dec8 } } = selection[4];
	const { field: { decoder: dec9 } } = selection[5];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3, c4, c5 ] = row;
		mapped[i] = { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec9.mapFromDriverValue(c5) };
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const nested1 = db.query.users.findFirst({
		with: {
			post: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
				},
			},
		},
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
		},
	}).prepare().mapper?.body;
	const nested2 = db.query.users.findMany({
		with: {
			post: {
				with: {
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
				},
			},
		},
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
		},
	}).prepare().mapper?.body;

	expect(nested1).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const { codec: codec6 } = selection[0];
	const { codec: codec7 } = selection[2];
	const { field: { decoder: dec8 } } = selection[4];
	const { selection: s9 } = selection[5];
	const { codec: codec16 } = s9[1];
	const { field: { decoder: dec17 } } = s9[3];
	const { selection: s18 } = s9[4];
	const { codec: codec24 } = s18[0];
	const { codec: codec25 } = s18[2];
	const { field: { decoder: dec26 } } = s18[4];
	const { selection: s27 } = s9[5];
	const { codec: codec34 } = s27[0];
	const { codec: codec35 } = s27[2];
	const { field: { decoder: dec36 } } = s27[4];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3, c4, c5 ] = row;
	if (c5 !== null) {
		let { "id": c10, "authorId": c11, "content": c12, "sql": c13, "author": c14, "authors": c15 } = c5;
		if (c14 !== null) {
			let { "id": c19, "name": c20, "createdAt": c21, "isBanned": c22, "sql": c23 } = c14;
			c14 = { "id": c19 === null ? null : codec24(c19, 0), "name": c20, "createdAt": c21 === null ? null : codec25(c21, 0), "isBanned": c22, "sql": c23 === null ? null : dec26.mapFromDriverValue(c23) };
		}
		if (c15 !== null) {
			for (let j28 = 0; j28 < c15.length; ++j28) {
				let { "id": c29, "name": c30, "createdAt": c31, "isBanned": c32, "sql": c33 } = c15[j28];
				c15[j28] = { "id": c29 === null ? null : codec34(c29, 0), "name": c30, "createdAt": c31 === null ? null : codec35(c31, 0), "isBanned": c32, "sql": c33 === null ? null : dec36.mapFromDriverValue(c33) };
			}
		}
		c5 = { "id": c10, "authorId": c11 === null ? null : codec16(c11, 0), "content": c12, "sql": c13 === null ? null : dec17.mapFromDriverValue(c13), "author": c14, "authors": c15 };
	}
	return { "id": c0 === null ? null : codec6(c0, 0), "name": c1, "createdAt": c2 === null ? null : codec7(c2, 0), "isBanned": c3, "sql": c4 === null ? null : dec8.mapFromDriverValue(c4), "post": c5 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(nested2).toStrictEqual(`function jitRqbMapper (rows) {
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
	const mapped = Array.from({ length });
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
}`);
});

test('Jit mappers: SQLWrapper', () => {
	const cus = customType<{ data: Date; driverData: string; jsonData: string }>({
		codec: 'timestamptz',
		dataType: () => 'timestamptz',
		forJsonSelect: (id, s) => s`${id}::text`,
		fromJson: (v) => new Date(v as string),
		toDriver: (v) => v.toISOString(),
	});
	const t = pgTable('jit_sqlw_regression', {
		id: integer('id').primaryKey(),
		c: cus('c').notNull(),
	});

	const jsonWrapper = { getSQL: () => sql`select 1`.mapWith(t.c) };
	const numberWrapper = { getSQL: () => sql`select 1`.mapWith(Number) };
	const noopWrapper = { getSQL: () => sql`select 1` };

	const jsonFirst = makeJitRqbMapper({
		selection: [{ key: 'val', field: jsonWrapper }],
		isFirst: true,
		parseJson: false,
		parseJsonIfString: false,
		rootJsonMappers: true,
		arrayModeRoot: false,
	});
	expect(jsonFirst.body).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const dec1 = selection[0].field.getSQL().decoder;
	const row = rows[0];
	if (!row) return undefined;
	let { "val": c0 } = row;
	rows[0] = { "val": c0 === null ? null : dec1.mapFromJsonValue(c0) };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(jsonFirst([{ val: '2024-01-02T03:04:05.000Z' }])).toStrictEqual({
		val: new Date('2024-01-02T03:04:05.000Z'),
	});
	expect(jsonFirst([{ val: null }])).toStrictEqual({ val: null });
	expect(jsonFirst([])).toBeUndefined();

	const jsonMany = makeJitRqbMapper({
		selection: [{ key: 'val', field: jsonWrapper as any }],
		isFirst: false,
		parseJson: false,
		parseJsonIfString: false,
		rootJsonMappers: true,
		arrayModeRoot: false,
	});
	expect(jsonMany.body).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);
	expect(jsonMany([{ val: '2024-01-02T03:04:05.000Z' }, { val: null }])).toStrictEqual([
		{ val: new Date('2024-01-02T03:04:05.000Z') },
		{ val: null },
	]);

	const driverFirst = makeJitRqbMapper({
		selection: [{ key: 'val', field: numberWrapper }],
		isFirst: true,
		parseJson: false,
		parseJsonIfString: false,
		rootJsonMappers: false,
		arrayModeRoot: false,
	});
	expect(driverFirst.body).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const dec1 = selection[0].field.getSQL().decoder;
	const row = rows[0];
	if (!row) return undefined;
	let { "val": c0 } = row;
	rows[0] = { "val": c0 === null ? null : dec1.mapFromDriverValue(c0) };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(driverFirst([{ val: '42' }])).toStrictEqual({ val: 42 });
	expect(driverFirst([{ val: null }])).toStrictEqual({ val: null });

	const noopMapper = makeJitRqbMapper({
		selection: [{ key: 'val', field: noopWrapper }],
		isFirst: true,
		parseJson: false,
		parseJsonIfString: false,
		rootJsonMappers: true,
		arrayModeRoot: false,
	});
	expect(noopMapper.body).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(noopMapper([{ val: 'raw' }])).toStrictEqual({ val: 'raw' });

	const mixed = makeJitRqbMapper({
		selection: [
			{ key: 'id', field: t.id },
			{ key: 'val', field: jsonWrapper },
		],
		isFirst: true,
		parseJson: false,
		parseJsonIfString: false,
		rootJsonMappers: true,
		arrayModeRoot: false,
	});
	expect(mixed.body).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const dec2 = selection[1].field.getSQL().decoder;
	const row = rows[0];
	if (!row) return undefined;
	let { "id": c0, "val": c1 } = row;
	rows[0] = { "id": c0, "val": c1 === null ? null : dec2.mapFromJsonValue(c1) };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(mixed([{ id: 7, val: '2024-01-02T03:04:05.000Z' }])).toStrictEqual({
		id: 7,
		val: new Date('2024-01-02T03:04:05.000Z'),
	});

	const arrayMode = makeJitRqbMapper({
		selection: [{ key: 'val', field: jsonWrapper }],
		isFirst: true,
		parseJson: false,
		parseJsonIfString: false,
		rootJsonMappers: true,
		arrayModeRoot: true,
	});
	expect(arrayMode.body).toStrictEqual(`function jitRqbMapper (rows) {
	"use strict";
	const { selection } = this;
	const row = rows[0];
	if (!row) return undefined;
	let [ c0 ] = row;
	return { "val": c0 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(arrayMode([['raw']])).toStrictEqual({ val: 'raw' });
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

test('Jit mappers: codecs from columns as SQL decoders', () => {
	const tableBody = codecDb.select({
		...getColumns(codecUsers),
		max: max(codecUsers.createdAt).as('max'),
		maxStr: max(codecUsers.createdAtStr).as('max_str'),
		arrMax: max(codecUsers.arrCreatedAt).as('arr_max'),
		sq: codecDb.select({ createdAt: codecUsers.createdAt }).from(codecUsers).as('sq'),
	}).from(codecUsers).groupBy(codecUsers.id).prepare().mapper?.body;

	expect(tableBody).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
});

test('Jit mappers: codecs from columns as SQL decoders - view', () => {
	const viewBody = codecDb.select().from(codecUsersView).prepare().mapper?.body;

	expect(viewBody).toStrictEqual(`function jitQueryMapper (rows) {
	"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
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
}`);
});

test('Jit mappers: codecs from columns as SQL decoders, codec bypass - RQB', () => {
	const tableBody = codecDb.query.codecUsers.findFirst({
		with: {
			self: {
				extras: {
					max: () => sql`select max(${codecUsers.createdAt}) from ${codecUsers}`.mapWith(codecUsers.createdAt),
				},
			},
		},
		extras: {
			max: () => sql`select max(${codecUsers.createdAt}) from ${codecUsers}`.mapWith(codecUsers.createdAt),
		},
	}).prepare().mapper?.body;

	expect(tableBody).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);
});

test('Jit mappers: codecs from columns as SQL decoders, codec bypass - view, RQB', () => {
	const viewNestedBody = codecDb.query.codecUsersView.findFirst({
		columns: { sq: false }, // TODO: re-enable after supporting Subquery in RQB
		with: { self: { columns: { sq: false } } }, // TODO: re-enable after supporting Subquery in RQB
	}).prepare().mapper?.body;

	expect(viewNestedBody).toStrictEqual(`function jitRqbMapper (rows) {
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
}`);
});
