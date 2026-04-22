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
	if(!rows[0]) return undefined;
	if(rows[0]["id"] !== null) {
		rows[0]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0]["id"], 0));
	}
	if(rows[0]["createdAt"] !== null) {
		rows[0]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[0]["createdAt"]);
	}
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(empty2).toStrictEqual(`function jitRqbMapper (rows) {
	for(let i = 0; i < rows.length; ++i) {
		if(rows[i]["id"] !== null) {
			rows[i]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i]["id"], 0));
		}
		if(rows[i]["createdAt"] !== null) {
			rows[i]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[i]["createdAt"]);
		}
	}
	return rows;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const simple1 = bodyForObjectRoot(db.query.users.findFirst(), true);
	const simple2 = bodyForObjectRoot(db.query.users.findMany(), false);

	expect(simple1).toStrictEqual(`function jitRqbMapper (rows) {
	if(!rows[0]) return undefined;
	if(rows[0]["id"] !== null) {
		rows[0]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0]["id"], 0));
	}
	if(rows[0]["createdAt"] !== null) {
		rows[0]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[0]["createdAt"]);
	}
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(simple2).toStrictEqual(`function jitRqbMapper (rows) {
	for(let i = 0; i < rows.length; ++i) {
		if(rows[i]["id"] !== null) {
			rows[i]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i]["id"], 0));
		}
		if(rows[i]["createdAt"] !== null) {
			rows[i]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[i]["createdAt"]);
		}
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
	if(!rows[0]) return undefined;
	if(rows[0]["id"] !== null) {
		rows[0]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0]["id"], 0));
	}
	if(rows[0]["createdAt"] !== null) {
		rows[0]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[0]["createdAt"]);
	}
	if(rows[0]["sql"] !== null) {
		rows[0]["sql"] = this.selection[4].field.decoder.mapFromDriverValue(rows[0]["sql"]);
	}
	if(rows[0]["sqlWrapper"] !== null) {
		rows[0]["sqlWrapper"] = this.selection[5].field.decoder.mapFromDriverValue(rows[0]["sqlWrapper"]);
	}
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(extra2).toStrictEqual(`function jitRqbMapper (rows) {
	for(let i = 0; i < rows.length; ++i) {
		if(rows[i]["id"] !== null) {
			rows[i]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i]["id"], 0));
		}
		if(rows[i]["createdAt"] !== null) {
			rows[i]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[i]["createdAt"]);
		}
		if(rows[i]["sql"] !== null) {
			rows[i]["sql"] = this.selection[4].field.decoder.mapFromDriverValue(rows[i]["sql"]);
		}
		if(rows[i]["sqlWrapper"] !== null) {
			rows[i]["sqlWrapper"] = this.selection[5].field.decoder.mapFromDriverValue(rows[i]["sqlWrapper"]);
		}
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
	if(!rows[0]) return undefined;
	if(rows[0]["id"] !== null) {
		rows[0]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0]["id"], 0));
	}
	if(rows[0]["createdAt"] !== null) {
		rows[0]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[0]["createdAt"]);
	}
	if(rows[0]["sql"] !== null) {
		rows[0]["sql"] = this.selection[4].field.decoder.mapFromDriverValue(rows[0]["sql"]);
	}
	if(rows[0]["sqlWrapper"] !== null) {
		rows[0]["sqlWrapper"] = this.selection[5].field.decoder.mapFromDriverValue(rows[0]["sqlWrapper"]);
	}
	if(rows[0]["post"] !== null) {
		if(rows[0]["post"]["authorId"] !== null) {
			rows[0]["post"]["authorId"] = this.selection[6].selection[1].field.mapFromDriverValue(this.selection[6].selection[1].codec(rows[0]["post"]["authorId"], 0));
		}
		if(rows[0]["post"]["sql"] !== null) {
			rows[0]["post"]["sql"] = this.selection[6].selection[3].field.decoder.mapFromDriverValue(rows[0]["post"]["sql"]);
		}
		if(rows[0]["post"]["sqlWrapper"] !== null) {
			rows[0]["post"]["sqlWrapper"] = this.selection[6].selection[4].field.decoder.mapFromDriverValue(rows[0]["post"]["sqlWrapper"]);
		}
		if(rows[0]["post"]["author"] !== null) {
			if(rows[0]["post"]["author"]["id"] !== null) {
				rows[0]["post"]["author"]["id"] = this.selection[6].selection[5].selection[0].field.mapFromDriverValue(this.selection[6].selection[5].selection[0].codec(rows[0]["post"]["author"]["id"], 0));
			}
			if(rows[0]["post"]["author"]["createdAt"] !== null) {
				rows[0]["post"]["author"]["createdAt"] = this.selection[6].selection[5].selection[2].field.mapFromDriverValue(rows[0]["post"]["author"]["createdAt"]);
			}
			if(rows[0]["post"]["author"]["sql"] !== null) {
				rows[0]["post"]["author"]["sql"] = this.selection[6].selection[5].selection[4].field.decoder.mapFromDriverValue(rows[0]["post"]["author"]["sql"]);
			}
			if(rows[0]["post"]["author"]["sqlWrapper"] !== null) {
				rows[0]["post"]["author"]["sqlWrapper"] = this.selection[6].selection[5].selection[5].field.decoder.mapFromDriverValue(rows[0]["post"]["author"]["sqlWrapper"]);
			}
		}
		for(let i1 = 0; i1 < rows[0]["post"]["authors"].length; ++i1 ) {
			if(rows[0]["post"]["authors"][i1]["id"] !== null) {
				rows[0]["post"]["authors"][i1]["id"] = this.selection[6].selection[6].selection[0].field.mapFromDriverValue(this.selection[6].selection[6].selection[0].codec(rows[0]["post"]["authors"][i1]["id"], 0));
			}
			if(rows[0]["post"]["authors"][i1]["createdAt"] !== null) {
				rows[0]["post"]["authors"][i1]["createdAt"] = this.selection[6].selection[6].selection[2].field.mapFromDriverValue(rows[0]["post"]["authors"][i1]["createdAt"]);
			}
			if(rows[0]["post"]["authors"][i1]["sql"] !== null) {
				rows[0]["post"]["authors"][i1]["sql"] = this.selection[6].selection[6].selection[4].field.decoder.mapFromDriverValue(rows[0]["post"]["authors"][i1]["sql"]);
			}
			if(rows[0]["post"]["authors"][i1]["sqlWrapper"] !== null) {
				rows[0]["post"]["authors"][i1]["sqlWrapper"] = this.selection[6].selection[6].selection[5].field.decoder.mapFromDriverValue(rows[0]["post"]["authors"][i1]["sqlWrapper"]);
			}
		}
	}
	if(rows[0]["posts"] !== null) {
		if(rows[0]["posts"]["authorId"] !== null) {
			rows[0]["posts"]["authorId"] = this.selection[7].selection[1].field.mapFromDriverValue(this.selection[7].selection[1].codec(rows[0]["posts"]["authorId"], 0));
		}
		if(rows[0]["posts"]["sql"] !== null) {
			rows[0]["posts"]["sql"] = this.selection[7].selection[3].field.decoder.mapFromDriverValue(rows[0]["posts"]["sql"]);
		}
		if(rows[0]["posts"]["sqlWrapper"] !== null) {
			rows[0]["posts"]["sqlWrapper"] = this.selection[7].selection[4].field.decoder.mapFromDriverValue(rows[0]["posts"]["sqlWrapper"]);
		}
		if(rows[0]["posts"]["author"] !== null) {
			if(rows[0]["posts"]["author"]["id"] !== null) {
				rows[0]["posts"]["author"]["id"] = this.selection[7].selection[5].selection[0].field.mapFromDriverValue(this.selection[7].selection[5].selection[0].codec(rows[0]["posts"]["author"]["id"], 0));
			}
			if(rows[0]["posts"]["author"]["createdAt"] !== null) {
				rows[0]["posts"]["author"]["createdAt"] = this.selection[7].selection[5].selection[2].field.mapFromDriverValue(rows[0]["posts"]["author"]["createdAt"]);
			}
			if(rows[0]["posts"]["author"]["sql"] !== null) {
				rows[0]["posts"]["author"]["sql"] = this.selection[7].selection[5].selection[4].field.decoder.mapFromDriverValue(rows[0]["posts"]["author"]["sql"]);
			}
			if(rows[0]["posts"]["author"]["sqlWrapper"] !== null) {
				rows[0]["posts"]["author"]["sqlWrapper"] = this.selection[7].selection[5].selection[5].field.decoder.mapFromDriverValue(rows[0]["posts"]["author"]["sqlWrapper"]);
			}
		}
		for(let i1 = 0; i1 < rows[0]["posts"]["authors"].length; ++i1 ) {
			if(rows[0]["posts"]["authors"][i1]["id"] !== null) {
				rows[0]["posts"]["authors"][i1]["id"] = this.selection[7].selection[6].selection[0].field.mapFromDriverValue(this.selection[7].selection[6].selection[0].codec(rows[0]["posts"]["authors"][i1]["id"], 0));
			}
			if(rows[0]["posts"]["authors"][i1]["createdAt"] !== null) {
				rows[0]["posts"]["authors"][i1]["createdAt"] = this.selection[7].selection[6].selection[2].field.mapFromDriverValue(rows[0]["posts"]["authors"][i1]["createdAt"]);
			}
			if(rows[0]["posts"]["authors"][i1]["sql"] !== null) {
				rows[0]["posts"]["authors"][i1]["sql"] = this.selection[7].selection[6].selection[4].field.decoder.mapFromDriverValue(rows[0]["posts"]["authors"][i1]["sql"]);
			}
			if(rows[0]["posts"]["authors"][i1]["sqlWrapper"] !== null) {
				rows[0]["posts"]["authors"][i1]["sqlWrapper"] = this.selection[7].selection[6].selection[5].field.decoder.mapFromDriverValue(rows[0]["posts"]["authors"][i1]["sqlWrapper"]);
			}
		}
	}
	return rows[0];
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(nested2).toStrictEqual(`function jitRqbMapper (rows) {
	for(let i = 0; i < rows.length; ++i) {
		if(rows[i]["id"] !== null) {
			rows[i]["id"] = this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i]["id"], 0));
		}
		if(rows[i]["createdAt"] !== null) {
			rows[i]["createdAt"] = this.selection[2].field.mapFromDriverValue(rows[i]["createdAt"]);
		}
		if(rows[i]["sql"] !== null) {
			rows[i]["sql"] = this.selection[4].field.decoder.mapFromDriverValue(rows[i]["sql"]);
		}
		if(rows[i]["sqlWrapper"] !== null) {
			rows[i]["sqlWrapper"] = this.selection[5].field.decoder.mapFromDriverValue(rows[i]["sqlWrapper"]);
		}
		if(rows[i]["post"] !== null) {
			if(rows[i]["post"]["authorId"] !== null) {
				rows[i]["post"]["authorId"] = this.selection[6].selection[1].field.mapFromDriverValue(this.selection[6].selection[1].codec(rows[i]["post"]["authorId"], 0));
			}
			if(rows[i]["post"]["sql"] !== null) {
				rows[i]["post"]["sql"] = this.selection[6].selection[3].field.decoder.mapFromDriverValue(rows[i]["post"]["sql"]);
			}
			if(rows[i]["post"]["sqlWrapper"] !== null) {
				rows[i]["post"]["sqlWrapper"] = this.selection[6].selection[4].field.decoder.mapFromDriverValue(rows[i]["post"]["sqlWrapper"]);
			}
			if(rows[i]["post"]["author"] !== null) {
				if(rows[i]["post"]["author"]["id"] !== null) {
					rows[i]["post"]["author"]["id"] = this.selection[6].selection[5].selection[0].field.mapFromDriverValue(this.selection[6].selection[5].selection[0].codec(rows[i]["post"]["author"]["id"], 0));
				}
				if(rows[i]["post"]["author"]["createdAt"] !== null) {
					rows[i]["post"]["author"]["createdAt"] = this.selection[6].selection[5].selection[2].field.mapFromDriverValue(rows[i]["post"]["author"]["createdAt"]);
				}
				if(rows[i]["post"]["author"]["sql"] !== null) {
					rows[i]["post"]["author"]["sql"] = this.selection[6].selection[5].selection[4].field.decoder.mapFromDriverValue(rows[i]["post"]["author"]["sql"]);
				}
				if(rows[i]["post"]["author"]["sqlWrapper"] !== null) {
					rows[i]["post"]["author"]["sqlWrapper"] = this.selection[6].selection[5].selection[5].field.decoder.mapFromDriverValue(rows[i]["post"]["author"]["sqlWrapper"]);
				}
			}
			for(let i1 = 0; i1 < rows[i]["post"]["authors"].length; ++i1 ) {
				if(rows[i]["post"]["authors"][i1]["id"] !== null) {
					rows[i]["post"]["authors"][i1]["id"] = this.selection[6].selection[6].selection[0].field.mapFromDriverValue(this.selection[6].selection[6].selection[0].codec(rows[i]["post"]["authors"][i1]["id"], 0));
				}
				if(rows[i]["post"]["authors"][i1]["createdAt"] !== null) {
					rows[i]["post"]["authors"][i1]["createdAt"] = this.selection[6].selection[6].selection[2].field.mapFromDriverValue(rows[i]["post"]["authors"][i1]["createdAt"]);
				}
				if(rows[i]["post"]["authors"][i1]["sql"] !== null) {
					rows[i]["post"]["authors"][i1]["sql"] = this.selection[6].selection[6].selection[4].field.decoder.mapFromDriverValue(rows[i]["post"]["authors"][i1]["sql"]);
				}
				if(rows[i]["post"]["authors"][i1]["sqlWrapper"] !== null) {
					rows[i]["post"]["authors"][i1]["sqlWrapper"] = this.selection[6].selection[6].selection[5].field.decoder.mapFromDriverValue(rows[i]["post"]["authors"][i1]["sqlWrapper"]);
				}
			}
		}
		if(rows[i]["posts"] !== null) {
			if(rows[i]["posts"]["authorId"] !== null) {
				rows[i]["posts"]["authorId"] = this.selection[7].selection[1].field.mapFromDriverValue(this.selection[7].selection[1].codec(rows[i]["posts"]["authorId"], 0));
			}
			if(rows[i]["posts"]["sql"] !== null) {
				rows[i]["posts"]["sql"] = this.selection[7].selection[3].field.decoder.mapFromDriverValue(rows[i]["posts"]["sql"]);
			}
			if(rows[i]["posts"]["sqlWrapper"] !== null) {
				rows[i]["posts"]["sqlWrapper"] = this.selection[7].selection[4].field.decoder.mapFromDriverValue(rows[i]["posts"]["sqlWrapper"]);
			}
			if(rows[i]["posts"]["author"] !== null) {
				if(rows[i]["posts"]["author"]["id"] !== null) {
					rows[i]["posts"]["author"]["id"] = this.selection[7].selection[5].selection[0].field.mapFromDriverValue(this.selection[7].selection[5].selection[0].codec(rows[i]["posts"]["author"]["id"], 0));
				}
				if(rows[i]["posts"]["author"]["createdAt"] !== null) {
					rows[i]["posts"]["author"]["createdAt"] = this.selection[7].selection[5].selection[2].field.mapFromDriverValue(rows[i]["posts"]["author"]["createdAt"]);
				}
				if(rows[i]["posts"]["author"]["sql"] !== null) {
					rows[i]["posts"]["author"]["sql"] = this.selection[7].selection[5].selection[4].field.decoder.mapFromDriverValue(rows[i]["posts"]["author"]["sql"]);
				}
				if(rows[i]["posts"]["author"]["sqlWrapper"] !== null) {
					rows[i]["posts"]["author"]["sqlWrapper"] = this.selection[7].selection[5].selection[5].field.decoder.mapFromDriverValue(rows[i]["posts"]["author"]["sqlWrapper"]);
				}
			}
			for(let i1 = 0; i1 < rows[i]["posts"]["authors"].length; ++i1 ) {
				if(rows[i]["posts"]["authors"][i1]["id"] !== null) {
					rows[i]["posts"]["authors"][i1]["id"] = this.selection[7].selection[6].selection[0].field.mapFromDriverValue(this.selection[7].selection[6].selection[0].codec(rows[i]["posts"]["authors"][i1]["id"], 0));
				}
				if(rows[i]["posts"]["authors"][i1]["createdAt"] !== null) {
					rows[i]["posts"]["authors"][i1]["createdAt"] = this.selection[7].selection[6].selection[2].field.mapFromDriverValue(rows[i]["posts"]["authors"][i1]["createdAt"]);
				}
				if(rows[i]["posts"]["authors"][i1]["sql"] !== null) {
					rows[i]["posts"]["authors"][i1]["sql"] = this.selection[7].selection[6].selection[4].field.decoder.mapFromDriverValue(rows[i]["posts"]["authors"][i1]["sql"]);
				}
				if(rows[i]["posts"]["authors"][i1]["sqlWrapper"] !== null) {
					rows[i]["posts"]["authors"][i1]["sqlWrapper"] = this.selection[7].selection[6].selection[5].field.decoder.mapFromDriverValue(rows[i]["posts"]["authors"][i1]["sqlWrapper"]);
				}
			}
		}
	}
	return rows;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
});

test('Jit mappers: relational - array mode', async () => {
	const empty1 = db.query.users.findFirst().prepare().mapper?.body;
	const empty2 = db.query.users.findMany().prepare().mapper?.body;

	expect(empty1).toStrictEqual(`function jitRqbMapper (rows) {
	if(!rows[0]) return undefined;
	const mapped = {};
	mapped["id"] = rows[0][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0][0], 0));
	mapped["name"] = rows[0][1];
	mapped["createdAt"] = rows[0][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[0][2]);
	mapped["isBanned"] = rows[0][3];
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(empty2).toStrictEqual(`function jitRqbMapper (rows) {
	const { length } = rows;
	const mapped = Array.from({ length });
	for(let i = 0; i < length; ++i) {
		mapped[i] = {};
		mapped[i]["id"] = rows[i][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i][0], 0));
		mapped[i]["name"] = rows[i][1];
		mapped[i]["createdAt"] = rows[i][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[i][2]);
		mapped[i]["isBanned"] = rows[i][3];
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);

	const simple1 = db.query.users.findFirst().prepare().mapper?.body;
	const simple2 = db.query.users.findMany().prepare().mapper?.body;

	expect(simple1).toStrictEqual(`function jitRqbMapper (rows) {
	if(!rows[0]) return undefined;
	const mapped = {};
	mapped["id"] = rows[0][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0][0], 0));
	mapped["name"] = rows[0][1];
	mapped["createdAt"] = rows[0][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[0][2]);
	mapped["isBanned"] = rows[0][3];
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(simple2).toStrictEqual(`function jitRqbMapper (rows) {
	const { length } = rows;
	const mapped = Array.from({ length });
	for(let i = 0; i < length; ++i) {
		mapped[i] = {};
		mapped[i]["id"] = rows[i][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i][0], 0));
		mapped[i]["name"] = rows[i][1];
		mapped[i]["createdAt"] = rows[i][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[i][2]);
		mapped[i]["isBanned"] = rows[i][3];
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
	if(!rows[0]) return undefined;
	const mapped = {};
	mapped["id"] = rows[0][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0][0], 0));
	mapped["name"] = rows[0][1];
	mapped["createdAt"] = rows[0][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[0][2]);
	mapped["isBanned"] = rows[0][3];
	mapped["sql"] = rows[0][4] === null ? null : this.selection[4].field.decoder.mapFromDriverValue(rows[0][4]);
	mapped["sqlWrapper"] = rows[0][5] === null ? null : this.selection[5].field.decoder.mapFromDriverValue(rows[0][5]);
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(extras2).toStrictEqual(`function jitRqbMapper (rows) {
	const { length } = rows;
	const mapped = Array.from({ length });
	for(let i = 0; i < length; ++i) {
		mapped[i] = {};
		mapped[i]["id"] = rows[i][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i][0], 0));
		mapped[i]["name"] = rows[i][1];
		mapped[i]["createdAt"] = rows[i][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[i][2]);
		mapped[i]["isBanned"] = rows[i][3];
		mapped[i]["sql"] = rows[i][4] === null ? null : this.selection[4].field.decoder.mapFromDriverValue(rows[i][4]);
		mapped[i]["sqlWrapper"] = rows[i][5] === null ? null : this.selection[5].field.decoder.mapFromDriverValue(rows[i][5]);
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
	if(!rows[0]) return undefined;
	const mapped = {};
	mapped["id"] = rows[0][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[0][0], 0));
	mapped["name"] = rows[0][1];
	mapped["createdAt"] = rows[0][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[0][2]);
	mapped["isBanned"] = rows[0][3];
	mapped["sql"] = rows[0][4] === null ? null : this.selection[4].field.decoder.mapFromDriverValue(rows[0][4]);
	mapped["post"] = rows[0][5];
	if(mapped["post"] !== null) {
		if(mapped["post"]["authorId"] !== null) {
			mapped["post"]["authorId"] = this.selection[5].selection[1].field.mapFromDriverValue(this.selection[5].selection[1].codec(mapped["post"]["authorId"], 0));
		}
		if(mapped["post"]["sql"] !== null) {
			mapped["post"]["sql"] = this.selection[5].selection[3].field.decoder.mapFromDriverValue(mapped["post"]["sql"]);
		}
		if(mapped["post"]["author"] !== null) {
			if(mapped["post"]["author"]["id"] !== null) {
				mapped["post"]["author"]["id"] = this.selection[5].selection[4].selection[0].field.mapFromDriverValue(this.selection[5].selection[4].selection[0].codec(mapped["post"]["author"]["id"], 0));
			}
			if(mapped["post"]["author"]["createdAt"] !== null) {
				mapped["post"]["author"]["createdAt"] = this.selection[5].selection[4].selection[2].field.mapFromDriverValue(mapped["post"]["author"]["createdAt"]);
			}
			if(mapped["post"]["author"]["sql"] !== null) {
				mapped["post"]["author"]["sql"] = this.selection[5].selection[4].selection[4].field.decoder.mapFromDriverValue(mapped["post"]["author"]["sql"]);
			}
		}
		for(let i1 = 0; i1 < mapped["post"]["authors"].length; ++i1 ) {
			if(mapped["post"]["authors"][i1]["id"] !== null) {
				mapped["post"]["authors"][i1]["id"] = this.selection[5].selection[5].selection[0].field.mapFromDriverValue(this.selection[5].selection[5].selection[0].codec(mapped["post"]["authors"][i1]["id"], 0));
			}
			if(mapped["post"]["authors"][i1]["createdAt"] !== null) {
				mapped["post"]["authors"][i1]["createdAt"] = this.selection[5].selection[5].selection[2].field.mapFromDriverValue(mapped["post"]["authors"][i1]["createdAt"]);
			}
			if(mapped["post"]["authors"][i1]["sql"] !== null) {
				mapped["post"]["authors"][i1]["sql"] = this.selection[5].selection[5].selection[4].field.decoder.mapFromDriverValue(mapped["post"]["authors"][i1]["sql"]);
			}
		}
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
	expect(nested2).toStrictEqual(`function jitRqbMapper (rows) {
	const { length } = rows;
	const mapped = Array.from({ length });
	for(let i = 0; i < length; ++i) {
		mapped[i] = {};
		mapped[i]["id"] = rows[i][0] === null ? null : this.selection[0].field.mapFromDriverValue(this.selection[0].codec(rows[i][0], 0));
		mapped[i]["name"] = rows[i][1];
		mapped[i]["createdAt"] = rows[i][2] === null ? null : this.selection[2].field.mapFromDriverValue(rows[i][2]);
		mapped[i]["isBanned"] = rows[i][3];
		mapped[i]["sql"] = rows[i][4] === null ? null : this.selection[4].field.decoder.mapFromDriverValue(rows[i][4]);
		mapped[i]["post"] = rows[i][5];
		if(mapped[i]["post"] !== null) {
			if(mapped[i]["post"]["authorId"] !== null) {
				mapped[i]["post"]["authorId"] = this.selection[5].selection[1].field.mapFromDriverValue(this.selection[5].selection[1].codec(mapped[i]["post"]["authorId"], 0));
			}
			if(mapped[i]["post"]["sql"] !== null) {
				mapped[i]["post"]["sql"] = this.selection[5].selection[3].field.decoder.mapFromDriverValue(mapped[i]["post"]["sql"]);
			}
			for(let i1 = 0; i1 < mapped[i]["post"]["authors"].length; ++i1 ) {
				if(mapped[i]["post"]["authors"][i1]["id"] !== null) {
					mapped[i]["post"]["authors"][i1]["id"] = this.selection[5].selection[4].selection[0].field.mapFromDriverValue(this.selection[5].selection[4].selection[0].codec(mapped[i]["post"]["authors"][i1]["id"], 0));
				}
				if(mapped[i]["post"]["authors"][i1]["createdAt"] !== null) {
					mapped[i]["post"]["authors"][i1]["createdAt"] = this.selection[5].selection[4].selection[2].field.mapFromDriverValue(mapped[i]["post"]["authors"][i1]["createdAt"]);
				}
				if(mapped[i]["post"]["authors"][i1]["sql"] !== null) {
					mapped[i]["post"]["authors"][i1]["sql"] = this.selection[5].selection[4].selection[4].field.decoder.mapFromDriverValue(mapped[i]["post"]["authors"][i1]["sql"]);
				}
			}
		}
	}
	return mapped;
	//# sourceURL=drizzle:jit-relational-query-mapper
}`);
});
