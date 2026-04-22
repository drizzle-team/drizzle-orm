import { expect, test } from 'vitest';
import { integer, pgTable } from '~/pg-core';
import { drizzle, PgliteDatabase } from '~/pglite';
import {
	AnyRelationsBuilderConfig,
	defineRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	makeJitRqbMapper,
	RelationsBuilder,
} from '~/relations';
import { eq, sql } from '~/sql';
import { getTableColumns } from '~/utils';

function createDB<S extends Record<string, unknown>, TConfig extends AnyRelationsBuilderConfig>(
	schema: S,
	cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
): PgliteDatabase<ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>> {
	return drizzle('memory://', {
		relations: defineRelations(schema, cb),
		useJitMappers: true,
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
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3 ] = rows[i];
		mapped[i] = {
			"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"name": c1,
			"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
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
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3 ] = rows[i];
		mapped[i] = {
			"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"name": c1,
			"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
			"isBanned": c3,
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3 ] = rows[i];
		mapped[i] = {
			"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"name": c1,
			"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
			"isBanned": c3,
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(updated).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3 ] = rows[i];
		mapped[i] = {
			"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"name": c1,
			"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
			"isBanned": c3,
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(deleted).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3 ] = rows[i];
		mapped[i] = {
			"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"name": c1,
			"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
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
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	const { field: decoder5, codec: codec5 } = columns[5];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3, c4, c5, c6 ] = rows[i];
		mapped[i] = {
			"user": {
				"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
				"name": c1,
				"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
				"isBanned": c3,
			},
			"post": c4 === null && c5 === null && c6 === null ? null : {
				"id": c4,
				"authorId": c5 === null ? c5 : decoder5.mapFromDriverValue(codec5(c5, 0)),
				"content": c6,
			},
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected2).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	const { field: decoder5, codec: codec5 } = columns[5];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3, c4, c5, c6 ] = rows[i];
		mapped[i] = {
			"user": {
				"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
				"name": c1,
				"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
				"isBanned": c3,
			},
			"post": {
				"id": c4,
				"authorId": c5 === null ? c5 : decoder5.mapFromDriverValue(codec5(c5, 0)),
				"content": c6,
			},
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected3).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder5 } = columns[5];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3, c4, c5 ] = rows[i];
		mapped[i] = {
			"userId": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"postId": c1,
			"name": c2,
			"isBanned": c3,
			"content": c4,
			"createdAt": c5 === null ? c5 : decoder5.mapFromDriverValue(c5),
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected4).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder5 } = columns[5];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3, c4, c5 ] = rows[i];
		mapped[i] = {
			"userId": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
			"postId": c1,
			"name": c2,
			"isBanned": c3,
			"content": c4,
			"createdAt": c5 === null ? c5 : decoder5.mapFromDriverValue(c5),
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected5).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder0, codec: codec0 } = columns[0];
	const { field: decoder2 } = columns[2];
	const { field: { sql: { decoder: decoder4 } } } = columns[4];
	const { field: decoder6, codec: codec6 } = columns[6];
	const { field: { sql: { decoder: decoder8 } } } = columns[8];
	for (let i = 0; i < length; ++i) {
		const [ c0, c1, c2, c3, c4, c5, c6, c7, c8 ] = rows[i];
		mapped[i] = {
			"user": {
				"id": c0 === null ? c0 : decoder0.mapFromDriverValue(codec0(c0, 0)),
				"name": c1,
				"createdAt": c2 === null ? c2 : decoder2.mapFromDriverValue(c2),
				"isBanned": c3,
				"extra": c4 === null ? c4 : decoder4.mapFromDriverValue(c4),
			},
			"post": c5 === null && c6 === null && c7 === null ? null : {
				"id": c5,
				"authorId": c6 === null ? c6 : decoder6.mapFromDriverValue(codec6(c6, 0)),
				"content": c7,
				"extra": c8 === null ? c8 : decoder8.mapFromDriverValue(c8),
			},
		};
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected6).toStrictEqual(`function jitQueryMapper (rows) {
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	const { field: decoder2, codec: codec2 } = columns[2];
	const { field: decoder4 } = columns[4];
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
					"id": c2 === null ? c2 : decoder2.mapFromDriverValue(codec2(c2, 0)),
					"name": c3,
					"createdAt": c4 === null ? c4 : decoder4.mapFromDriverValue(c4),
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
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	const row = rows[0];
	if (!row) return undefined;
	let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
	rows[0] = { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(empty2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	for (let i = 0; i < rows.length; ++i) {
		const row = rows[i];
		let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
		rows[i] = { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
	}
	return rows;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const simple1 = bodyForObjectRoot(db.query.users.findFirst(), true);
	const simple2 = bodyForObjectRoot(db.query.users.findMany(), false);

	expect(simple1).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	const row = rows[0];
	if (!row) return undefined;
	let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
	rows[0] = { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(simple2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	for (let i = 0; i < rows.length; ++i) {
		const row = rows[i];
		let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3 } = row;
		rows[i] = { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
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
	const { selection } = this;
	const { field: dec6, codec: codec7 } = selection[0];
	const { field: dec8 } = selection[2];
	const { field: { decoder: dec9 } } = selection[4];
	const { field: { decoder: dec10 } } = selection[5];
	const row = rows[0];
	if (!row) return undefined;
	let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5 } = row;
	rows[0] = { "id": c0 === null ? null : dec6.mapFromDriverValue(codec7(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec8.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec9.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec10.mapFromDriverValue(c5) };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(extra2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec6, codec: codec7 } = selection[0];
	const { field: dec8 } = selection[2];
	const { field: { decoder: dec9 } } = selection[4];
	const { field: { decoder: dec10 } } = selection[5];
	for (let i = 0; i < rows.length; ++i) {
		const row = rows[i];
		let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5 } = row;
		rows[i] = { "id": c0 === null ? null : dec6.mapFromDriverValue(codec7(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec8.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec9.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec10.mapFromDriverValue(c5) };
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
	const { selection } = this;
	const { field: dec8, codec: codec9 } = selection[0];
	const { field: dec10 } = selection[2];
	const { field: { decoder: dec11 } } = selection[4];
	const { field: { decoder: dec12 } } = selection[5];
	const { selection: s13 } = selection[6];
	const { field: dec21, codec: codec22 } = s13[1];
	const { field: { decoder: dec23 } } = s13[3];
	const { field: { decoder: dec24 } } = s13[4];
	const { selection: s25 } = s13[5];
	const { field: dec32, codec: codec33 } = s25[0];
	const { field: dec34 } = s25[2];
	const { field: { decoder: dec35 } } = s25[4];
	const { field: { decoder: dec36 } } = s25[5];
	const { selection: s37 } = s13[6];
	const { field: dec45, codec: codec46 } = s37[0];
	const { field: dec47 } = s37[2];
	const { field: { decoder: dec48 } } = s37[4];
	const { field: { decoder: dec49 } } = s37[5];
	const { selection: s50 } = selection[7];
	const { field: dec58, codec: codec59 } = s50[1];
	const { field: { decoder: dec60 } } = s50[3];
	const { field: { decoder: dec61 } } = s50[4];
	const { selection: s62 } = s50[5];
	const { field: dec69, codec: codec70 } = s62[0];
	const { field: dec71 } = s62[2];
	const { field: { decoder: dec72 } } = s62[4];
	const { field: { decoder: dec73 } } = s62[5];
	const { selection: s74 } = s50[6];
	const { field: dec82, codec: codec83 } = s74[0];
	const { field: dec84 } = s74[2];
	const { field: { decoder: dec85 } } = s74[4];
	const { field: { decoder: dec86 } } = s74[5];
	const row = rows[0];
	if (!row) return undefined;
	let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5, "post": c6, "posts": c7 } = row;
	if (c6 !== null) {
		let { "id": c14, "authorId": c15, "content": c16, "sql": c17, "sqlWrapper": c18, "author": c19, "authors": c20 } = c6;
		if (c19 !== null) {
			let { "id": c26, "name": c27, "createdAt": c28, "isBanned": c29, "sql": c30, "sqlWrapper": c31 } = c19;
			c19 = { "id": c26 === null ? null : dec32.mapFromDriverValue(codec33(c26, 0)), "name": c27, "createdAt": c28 === null ? null : dec34.mapFromDriverValue(c28), "isBanned": c29, "sql": c30 === null ? null : dec35.mapFromDriverValue(c30), "sqlWrapper": c31 === null ? null : dec36.mapFromDriverValue(c31) };
		}
		if (c20 !== null) {
			for (let j38 = 0; j38 < c20.length; ++j38) {
				let { "id": c39, "name": c40, "createdAt": c41, "isBanned": c42, "sql": c43, "sqlWrapper": c44 } = c20[j38];
				c20[j38] = { "id": c39 === null ? null : dec45.mapFromDriverValue(codec46(c39, 0)), "name": c40, "createdAt": c41 === null ? null : dec47.mapFromDriverValue(c41), "isBanned": c42, "sql": c43 === null ? null : dec48.mapFromDriverValue(c43), "sqlWrapper": c44 === null ? null : dec49.mapFromDriverValue(c44) };
			}
		}
		c6 = { "id": c14, "authorId": c15 === null ? null : dec21.mapFromDriverValue(codec22(c15, 0)), "content": c16, "sql": c17 === null ? null : dec23.mapFromDriverValue(c17), "sqlWrapper": c18 === null ? null : dec24.mapFromDriverValue(c18), "author": c19, "authors": c20 };
	}
	if (c7 !== null) {
		let { "id": c51, "authorId": c52, "content": c53, "sql": c54, "sqlWrapper": c55, "author": c56, "authors": c57 } = c7;
		if (c56 !== null) {
			let { "id": c63, "name": c64, "createdAt": c65, "isBanned": c66, "sql": c67, "sqlWrapper": c68 } = c56;
			c56 = { "id": c63 === null ? null : dec69.mapFromDriverValue(codec70(c63, 0)), "name": c64, "createdAt": c65 === null ? null : dec71.mapFromDriverValue(c65), "isBanned": c66, "sql": c67 === null ? null : dec72.mapFromDriverValue(c67), "sqlWrapper": c68 === null ? null : dec73.mapFromDriverValue(c68) };
		}
		if (c57 !== null) {
			for (let j75 = 0; j75 < c57.length; ++j75) {
				let { "id": c76, "name": c77, "createdAt": c78, "isBanned": c79, "sql": c80, "sqlWrapper": c81 } = c57[j75];
				c57[j75] = { "id": c76 === null ? null : dec82.mapFromDriverValue(codec83(c76, 0)), "name": c77, "createdAt": c78 === null ? null : dec84.mapFromDriverValue(c78), "isBanned": c79, "sql": c80 === null ? null : dec85.mapFromDriverValue(c80), "sqlWrapper": c81 === null ? null : dec86.mapFromDriverValue(c81) };
			}
		}
		c7 = { "id": c51, "authorId": c52 === null ? null : dec58.mapFromDriverValue(codec59(c52, 0)), "content": c53, "sql": c54 === null ? null : dec60.mapFromDriverValue(c54), "sqlWrapper": c55 === null ? null : dec61.mapFromDriverValue(c55), "author": c56, "authors": c57 };
	}
	rows[0] = { "id": c0 === null ? null : dec8.mapFromDriverValue(codec9(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec10.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec11.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec12.mapFromDriverValue(c5), "post": c6, "posts": c7 };
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(nested2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec8, codec: codec9 } = selection[0];
	const { field: dec10 } = selection[2];
	const { field: { decoder: dec11 } } = selection[4];
	const { field: { decoder: dec12 } } = selection[5];
	const { selection: s13 } = selection[6];
	const { field: dec21, codec: codec22 } = s13[1];
	const { field: { decoder: dec23 } } = s13[3];
	const { field: { decoder: dec24 } } = s13[4];
	const { selection: s25 } = s13[5];
	const { field: dec32, codec: codec33 } = s25[0];
	const { field: dec34 } = s25[2];
	const { field: { decoder: dec35 } } = s25[4];
	const { field: { decoder: dec36 } } = s25[5];
	const { selection: s37 } = s13[6];
	const { field: dec45, codec: codec46 } = s37[0];
	const { field: dec47 } = s37[2];
	const { field: { decoder: dec48 } } = s37[4];
	const { field: { decoder: dec49 } } = s37[5];
	const { selection: s50 } = selection[7];
	const { field: dec58, codec: codec59 } = s50[1];
	const { field: { decoder: dec60 } } = s50[3];
	const { field: { decoder: dec61 } } = s50[4];
	const { selection: s62 } = s50[5];
	const { field: dec69, codec: codec70 } = s62[0];
	const { field: dec71 } = s62[2];
	const { field: { decoder: dec72 } } = s62[4];
	const { field: { decoder: dec73 } } = s62[5];
	const { selection: s74 } = s50[6];
	const { field: dec82, codec: codec83 } = s74[0];
	const { field: dec84 } = s74[2];
	const { field: { decoder: dec85 } } = s74[4];
	const { field: { decoder: dec86 } } = s74[5];
	for (let i = 0; i < rows.length; ++i) {
		const row = rows[i];
		let { "id": c0, "name": c1, "createdAt": c2, "isBanned": c3, "sql": c4, "sqlWrapper": c5, "post": c6, "posts": c7 } = row;
		if (c6 !== null) {
			let { "id": c14, "authorId": c15, "content": c16, "sql": c17, "sqlWrapper": c18, "author": c19, "authors": c20 } = c6;
			if (c19 !== null) {
				let { "id": c26, "name": c27, "createdAt": c28, "isBanned": c29, "sql": c30, "sqlWrapper": c31 } = c19;
				c19 = { "id": c26 === null ? null : dec32.mapFromDriverValue(codec33(c26, 0)), "name": c27, "createdAt": c28 === null ? null : dec34.mapFromDriverValue(c28), "isBanned": c29, "sql": c30 === null ? null : dec35.mapFromDriverValue(c30), "sqlWrapper": c31 === null ? null : dec36.mapFromDriverValue(c31) };
			}
			if (c20 !== null) {
				for (let j38 = 0; j38 < c20.length; ++j38) {
					let { "id": c39, "name": c40, "createdAt": c41, "isBanned": c42, "sql": c43, "sqlWrapper": c44 } = c20[j38];
					c20[j38] = { "id": c39 === null ? null : dec45.mapFromDriverValue(codec46(c39, 0)), "name": c40, "createdAt": c41 === null ? null : dec47.mapFromDriverValue(c41), "isBanned": c42, "sql": c43 === null ? null : dec48.mapFromDriverValue(c43), "sqlWrapper": c44 === null ? null : dec49.mapFromDriverValue(c44) };
				}
			}
			c6 = { "id": c14, "authorId": c15 === null ? null : dec21.mapFromDriverValue(codec22(c15, 0)), "content": c16, "sql": c17 === null ? null : dec23.mapFromDriverValue(c17), "sqlWrapper": c18 === null ? null : dec24.mapFromDriverValue(c18), "author": c19, "authors": c20 };
		}
		if (c7 !== null) {
			let { "id": c51, "authorId": c52, "content": c53, "sql": c54, "sqlWrapper": c55, "author": c56, "authors": c57 } = c7;
			if (c56 !== null) {
				let { "id": c63, "name": c64, "createdAt": c65, "isBanned": c66, "sql": c67, "sqlWrapper": c68 } = c56;
				c56 = { "id": c63 === null ? null : dec69.mapFromDriverValue(codec70(c63, 0)), "name": c64, "createdAt": c65 === null ? null : dec71.mapFromDriverValue(c65), "isBanned": c66, "sql": c67 === null ? null : dec72.mapFromDriverValue(c67), "sqlWrapper": c68 === null ? null : dec73.mapFromDriverValue(c68) };
			}
			if (c57 !== null) {
				for (let j75 = 0; j75 < c57.length; ++j75) {
					let { "id": c76, "name": c77, "createdAt": c78, "isBanned": c79, "sql": c80, "sqlWrapper": c81 } = c57[j75];
					c57[j75] = { "id": c76 === null ? null : dec82.mapFromDriverValue(codec83(c76, 0)), "name": c77, "createdAt": c78 === null ? null : dec84.mapFromDriverValue(c78), "isBanned": c79, "sql": c80 === null ? null : dec85.mapFromDriverValue(c80), "sqlWrapper": c81 === null ? null : dec86.mapFromDriverValue(c81) };
				}
			}
			c7 = { "id": c51, "authorId": c52 === null ? null : dec58.mapFromDriverValue(codec59(c52, 0)), "content": c53, "sql": c54 === null ? null : dec60.mapFromDriverValue(c54), "sqlWrapper": c55 === null ? null : dec61.mapFromDriverValue(c55), "author": c56, "authors": c57 };
		}
		rows[i] = { "id": c0 === null ? null : dec8.mapFromDriverValue(codec9(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec10.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec11.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec12.mapFromDriverValue(c5), "post": c6, "posts": c7 };
	}
	return rows;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
});

test('Jit mappers: relational - array mode', async () => {
	const empty1 = db.query.users.findFirst().prepare().mapper?.body;
	const empty2 = db.query.users.findMany().prepare().mapper?.body;

	expect(empty1).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3 ] = row;
	return { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(empty2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3 ] = row;
		mapped[i] = { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const simple1 = db.query.users.findFirst().prepare().mapper?.body;
	const simple2 = db.query.users.findMany().prepare().mapper?.body;

	expect(simple1).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3 ] = row;
	return { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(simple2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec4, codec: codec5 } = selection[0];
	const { field: dec6 } = selection[2];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3 ] = row;
		mapped[i] = { "id": c0 === null ? null : dec4.mapFromDriverValue(codec5(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec6.mapFromDriverValue(c2), "isBanned": c3 };
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
	const { selection } = this;
	const { field: dec6, codec: codec7 } = selection[0];
	const { field: dec8 } = selection[2];
	const { field: { decoder: dec9 } } = selection[4];
	const { field: { decoder: dec10 } } = selection[5];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3, c4, c5 ] = row;
	return { "id": c0 === null ? null : dec6.mapFromDriverValue(codec7(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec8.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec9.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec10.mapFromDriverValue(c5) };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(extras2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec6, codec: codec7 } = selection[0];
	const { field: dec8 } = selection[2];
	const { field: { decoder: dec9 } } = selection[4];
	const { field: { decoder: dec10 } } = selection[5];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3, c4, c5 ] = row;
		mapped[i] = { "id": c0 === null ? null : dec6.mapFromDriverValue(codec7(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec8.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec9.mapFromDriverValue(c4), "sqlWrapper": c5 === null ? null : dec10.mapFromDriverValue(c5) };
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
	const { selection } = this;
	const { field: dec6, codec: codec7 } = selection[0];
	const { field: dec8 } = selection[2];
	const { field: { decoder: dec9 } } = selection[4];
	const { selection: s10 } = selection[5];
	const { field: dec17, codec: codec18 } = s10[1];
	const { field: { decoder: dec19 } } = s10[3];
	const { selection: s20 } = s10[4];
	const { field: dec26, codec: codec27 } = s20[0];
	const { field: dec28 } = s20[2];
	const { field: { decoder: dec29 } } = s20[4];
	const { selection: s30 } = s10[5];
	const { field: dec37, codec: codec38 } = s30[0];
	const { field: dec39 } = s30[2];
	const { field: { decoder: dec40 } } = s30[4];
	const row = rows[0];
	if (!row) return undefined;
	let [ c0, c1, c2, c3, c4, c5 ] = row;
	if (c5 !== null) {
		let { "id": c11, "authorId": c12, "content": c13, "sql": c14, "author": c15, "authors": c16 } = c5;
		if (c15 !== null) {
			let { "id": c21, "name": c22, "createdAt": c23, "isBanned": c24, "sql": c25 } = c15;
			c15 = { "id": c21 === null ? null : dec26.mapFromDriverValue(codec27(c21, 0)), "name": c22, "createdAt": c23 === null ? null : dec28.mapFromDriverValue(c23), "isBanned": c24, "sql": c25 === null ? null : dec29.mapFromDriverValue(c25) };
		}
		if (c16 !== null) {
			for (let j31 = 0; j31 < c16.length; ++j31) {
				let { "id": c32, "name": c33, "createdAt": c34, "isBanned": c35, "sql": c36 } = c16[j31];
				c16[j31] = { "id": c32 === null ? null : dec37.mapFromDriverValue(codec38(c32, 0)), "name": c33, "createdAt": c34 === null ? null : dec39.mapFromDriverValue(c34), "isBanned": c35, "sql": c36 === null ? null : dec40.mapFromDriverValue(c36) };
			}
		}
		c5 = { "id": c11, "authorId": c12 === null ? null : dec17.mapFromDriverValue(codec18(c12, 0)), "content": c13, "sql": c14 === null ? null : dec19.mapFromDriverValue(c14), "author": c15, "authors": c16 };
	}
	return { "id": c0 === null ? null : dec6.mapFromDriverValue(codec7(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec8.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec9.mapFromDriverValue(c4), "post": c5 };
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(nested2).toStrictEqual(`function jitRqbMapper (rows) {
	const { selection } = this;
	const { field: dec6, codec: codec7 } = selection[0];
	const { field: dec8 } = selection[2];
	const { field: { decoder: dec9 } } = selection[4];
	const { selection: s10 } = selection[5];
	const { field: dec16, codec: codec17 } = s10[1];
	const { field: { decoder: dec18 } } = s10[3];
	const { selection: s19 } = s10[4];
	const { field: dec26, codec: codec27 } = s19[0];
	const { field: dec28 } = s19[2];
	const { field: { decoder: dec29 } } = s19[4];
	const { length } = rows;
	const mapped = Array.from({ length });
	for (let i = 0; i < length; ++i) {
		const row = rows[i];
		let [ c0, c1, c2, c3, c4, c5 ] = row;
		if (c5 !== null) {
			let { "id": c11, "authorId": c12, "content": c13, "sql": c14, "authors": c15 } = c5;
			if (c15 !== null) {
				for (let j20 = 0; j20 < c15.length; ++j20) {
					let { "id": c21, "name": c22, "createdAt": c23, "isBanned": c24, "sql": c25 } = c15[j20];
					c15[j20] = { "id": c21 === null ? null : dec26.mapFromDriverValue(codec27(c21, 0)), "name": c22, "createdAt": c23 === null ? null : dec28.mapFromDriverValue(c23), "isBanned": c24, "sql": c25 === null ? null : dec29.mapFromDriverValue(c25) };
				}
			}
			c5 = { "id": c11, "authorId": c12 === null ? null : dec16.mapFromDriverValue(codec17(c12, 0)), "content": c13, "sql": c14 === null ? null : dec18.mapFromDriverValue(c14), "authors": c15 };
		}
		mapped[i] = { "id": c0 === null ? null : dec6.mapFromDriverValue(codec7(c0, 0)), "name": c1, "createdAt": c2 === null ? null : dec8.mapFromDriverValue(c2), "isBanned": c3, "sql": c4 === null ? null : dec9.mapFromDriverValue(c4), "post": c5 };
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
});
