import { expect, test } from 'vitest';
import { pgTable } from '~/pg-core';
import { drizzle, PgliteDatabase } from '~/pglite';
import {
	AnyRelationsBuilderConfig,
	defineRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
} from '~/relations';
import { eq, sql } from '~/sql';

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

test('Jit mappers: simple select - no rows', async () => {
	expect(db.select().from(users).prepare().mapper?.body).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		res["name"] = rows[i][1];
		res["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		res["isBanned"] = rows[i][3];
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
});

test('Jit mappers: select - nothing to decode - text', async () => {
	expect(db.select({ name: users.name }).from(users).prepare().mapper?.body).toStrictEqual(
		`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["name"] = rows[i][0];
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`,
	);
});

test('Jit mappers: select - nothing to decode - null', async () => {
	expect(db.select({ isBanned: users.isBanned }).from(users).prepare().mapper?.body).toStrictEqual(
		`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["isBanned"] = rows[i][0];
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
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
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		res["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		res["name"] = rows[i][1];
		res["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		res["isBanned"] = rows[i][3];
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		res["name"] = rows[i][1];
		res["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		res["isBanned"] = rows[i][3];
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(updated).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		res["name"] = rows[i][1];
		res["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		res["isBanned"] = rows[i][3];
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(deleted).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		res["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		res["name"] = rows[i][1];
		res["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		res["isBanned"] = rows[i][3];
		mapped[i] = res;
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

	expect(selected1).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["user"] = {};
		res["user"]["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["id"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["user"]["name"] = rows[i][1];
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["name"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["user"]["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["createdAt"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["user"]["isBanned"] = rows[i][3];
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["isBanned"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["post"] = {};
		res["post"]["id"] = rows[i][4];
		if (!("post" in nullifyMap)) {
			nullifyMap["post"] = res["post"]["id"] === null ? "posts" : false;
		} else if (typeof nullifyMap["post"] === 'string' && nullifyMap["post"] !== "posts") {
			nullifyMap["post"] = false;
		}
		res["post"]["authorId"] = rows[i][5] === null ? rows[i][5] : this.columns[5].field.mapFromDriverValue(this.columns[5].codec(rows[i][5], 0));
		if (!("post" in nullifyMap)) {
			nullifyMap["post"] = res["post"]["authorId"] === null ? "posts" : false;
		} else if (typeof nullifyMap["post"] === 'string' && nullifyMap["post"] !== "posts") {
			nullifyMap["post"] = false;
		}
		res["post"]["content"] = rows[i][6];
		if (!("post" in nullifyMap)) {
			nullifyMap["post"] = res["post"]["content"] === null ? "posts" : false;
		} else if (typeof nullifyMap["post"] === 'string' && nullifyMap["post"] !== "posts") {
			nullifyMap["post"] = false;
		}
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected2).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["user"] = {};
		res["user"]["id"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["id"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["user"]["name"] = rows[i][1];
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["name"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["user"]["createdAt"] = rows[i][2] === null ? rows[i][2] : this.columns[2].field.mapFromDriverValue(rows[i][2]);
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["createdAt"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["user"]["isBanned"] = rows[i][3];
		if (!("user" in nullifyMap)) {
			nullifyMap["user"] = res["user"]["isBanned"] === null ? "users" : false;
		} else if (typeof nullifyMap["user"] === 'string' && nullifyMap["user"] !== "users") {
			nullifyMap["user"] = false;
		}
		res["post"] = {};
		res["post"]["id"] = rows[i][4];
		if (!("post" in nullifyMap)) {
			nullifyMap["post"] = res["post"]["id"] === null ? "posts" : false;
		} else if (typeof nullifyMap["post"] === 'string' && nullifyMap["post"] !== "posts") {
			nullifyMap["post"] = false;
		}
		res["post"]["authorId"] = rows[i][5] === null ? rows[i][5] : this.columns[5].field.mapFromDriverValue(this.columns[5].codec(rows[i][5], 0));
		if (!("post" in nullifyMap)) {
			nullifyMap["post"] = res["post"]["authorId"] === null ? "posts" : false;
		} else if (typeof nullifyMap["post"] === 'string' && nullifyMap["post"] !== "posts") {
			nullifyMap["post"] = false;
		}
		res["post"]["content"] = rows[i][6];
		if (!("post" in nullifyMap)) {
			nullifyMap["post"] = res["post"]["content"] === null ? "posts" : false;
		} else if (typeof nullifyMap["post"] === 'string' && nullifyMap["post"] !== "posts") {
			nullifyMap["post"] = false;
		}
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
	expect(selected4).toStrictEqual(`function jitQueryMapper (rows) {
	const mapped = [];
	for (let i = 0; i < rows.length; ++i) {
		const res = {};
		const nullifyMap = {};
		res["userId"] = rows[i][0] === null ? rows[i][0] : this.columns[0].field.mapFromDriverValue(this.columns[0].codec(rows[i][0], 0));
		res["postId"] = rows[i][1];
		res["name"] = rows[i][2];
		res["isBanned"] = rows[i][3];
		res["content"] = rows[i][4];
		res["createdAt"] = rows[i][5] === null ? rows[i][5] : this.columns[5].field.mapFromDriverValue(rows[i][5]);
		if(Object.keys(nullifyMap).length) {
			for (const [objectName, tableName] of Object.entries(nullifyMap)) {
				if (typeof tableName === 'string' && !this.joinsNotNullableMap[tableName]) {
					res[objectName] = null;
				}
			}
		}
		mapped[i] = res;
	}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper
}`);
});

test('Jit mappers: relational', async () => {
	const empty1 = db.query.users.findFirst().prepare().mapper?.body;
	const empty2 = db.query.users.findMany().prepare().mapper?.body;

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

	const simple1 = db.query.users.findFirst().prepare().mapper?.body;
	const simple2 = db.query.users.findMany().prepare().mapper?.body;

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

	const extra1 = db.query.users.findFirst({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	}).prepare().mapper?.body;
	const extra2 = db.query.users.findMany({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	}).prepare().mapper?.body;

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

	const nested1 = db.query.users.findFirst({
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
	}).prepare().mapper?.body;
	const nested2 = db.query.users.findMany({
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
	}).prepare().mapper?.body;

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
