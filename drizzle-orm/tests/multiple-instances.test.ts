import { describe, expect, test, vi } from 'vitest';

// Two instances of the same library version, the way a monorepo ends up with them
// when workspace packages resolve separate copies: every class exists twice.
async function load() {
	return {
		orm: await import('~/index.ts'),
		pg: await import('~/pg-core/index.ts'),
		pglite: await import('~/pglite/index.ts'),
	};
}

const own = await load();
vi.resetModules();
const foreign = await load();

type Lib = typeof own;

function schema({ orm, pg }: Lib) {
	const users = pg.pgTable('users', {
		id: pg.integer('id').primaryKey(),
		name: pg.text('name').notNull(),
		invitedBy: pg.integer('invited_by'),
	});
	const posts = pg.pgTable('posts', {
		id: pg.integer('id').primaryKey(),
		title: pg.text('title').notNull(),
		authorId: pg.integer('author_id').notNull(),
	});
	const qb = new pg.QueryBuilder();

	return {
		users,
		posts,
		invitees: pg.alias(users, 'invitees'),
		filter: orm.and(orm.eq(users.name, 'John'), orm.inArray(users.id, [1, 2, 3])),
		fragment: orm.sql<string>`lower(${users.name})`,
		recentPosts: qb.select().from(posts).where(orm.gt(posts.id, 10)).as('recent_posts'),
		userNames: pg.pgView('user_names').as((qb) => qb.select({ id: users.id, name: users.name }).from(users)),
	};
}

// Schema objects of `lib` used through the query builders of `own`
function queries(lib: Lib) {
	const { orm, pglite } = own;
	const s = schema(lib);
	const db = pglite.drizzle.mock();
	const relationalDb = () =>
		pglite.drizzle.mock({
			relations: orm.defineRelations({ users: s.users, posts: s.posts }, (r) => ({
				users: {
					posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }),
					invitee: r.one.users({ from: r.users.invitedBy, to: r.users.id }),
				},
				posts: {
					author: r.one.users({ from: r.posts.authorId, to: r.users.id, optional: false }),
				},
			})),
		});

	return {
		select: () => db.select().from(s.users).where(s.filter).orderBy(orm.desc(s.users.id)).limit(5).toSQL(),
		partialSelect: () => db.select({ id: s.users.id, lowerName: s.fragment }).from(s.users).toSQL(),
		sqlTemplate: () => db.dialect.sqlToQuery(orm.sql`select ${s.fragment} from ${s.users} where ${s.filter}`),
		joins: () =>
			db.select()
				.from(s.users)
				.leftJoin(s.invitees, orm.eq(s.users.invitedBy, s.invitees.id))
				.innerJoin(s.recentPosts, orm.eq(s.recentPosts.authorId, s.users.id))
				.toSQL(),
		view: () => db.select().from(s.userNames).where(orm.eq(s.userNames.id, 1)).toSQL(),
		insert: () =>
			db.insert(s.users)
				.values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane', invitedBy: 1 }])
				.onConflictDoUpdate({ target: s.users.id, set: { name: orm.sql`excluded.name` } })
				.returning()
				.toSQL(),
		update: () => db.update(s.users).set({ name: s.fragment }).where(s.filter).toSQL(),
		delete: () => db.delete(s.posts).where(orm.eq(s.posts.authorId, 1)).returning({ id: s.posts.id }).toSQL(),
		relational: () =>
			relationalDb().query.users.findMany({
				with: { posts: { where: { title: { like: 'Hello%' } }, limit: 3 }, invitee: true },
				where: { name: 'John', posts: { id: { gt: 10 } } },
				orderBy: { id: 'desc' },
				limit: 10,
			}).toSQL(),
	};
}

const viaOwn = queries(own);
const viaForeign = queries(foreign);

describe('multiple library instances', () => {
	// Ensures tests are functional - this is what happens with multiple instances of same library
	test('instances do not share classes', () => {
		const { users } = schema(foreign);

		expect(foreign.orm.Table).not.toBe(own.orm.Table);
		expect(foreign.pg.PgColumn).not.toBe(own.pg.PgColumn);
		expect(Object.prototype.isPrototypeOf.call(own.orm.Table.prototype, users)).toBe(false);
	});

	test('is() recognises entities of another instance', () => {
		const s = schema(foreign);
		const { is } = own.orm;

		expect(is(s.users, own.orm.Table)).toBe(true);
		expect(is(s.users, own.pg.PgTable)).toBe(true);
		expect(is(s.users.id, own.orm.Column)).toBe(true);
		expect(is(s.users.id, own.pg.PgColumn)).toBe(true);
		expect(is(s.users.id, own.pg.PgInteger)).toBe(true);
		expect(is(s.fragment, own.orm.SQL)).toBe(true);
		expect(is(s.recentPosts, own.orm.Subquery)).toBe(true);
		expect(is(s.userNames, own.orm.View)).toBe(true);

		expect(is(s.users, own.orm.Column)).toBe(false);
		expect(is(s.users.id, own.pg.PgText)).toBe(false);
		expect(is(s.fragment, own.orm.Table)).toBe(false);
	});

	test('instanceof recognises entities of another instance', () => {
		const s = schema(foreign);

		expect(s.users instanceof own.orm.Table).toBe(true);
		expect(s.users instanceof own.pg.PgTable).toBe(true);
		expect(s.users.id instanceof own.orm.Column).toBe(true);
		expect(s.users.id instanceof own.pg.PgInteger).toBe(true);
		expect(s.fragment instanceof own.orm.SQL).toBe(true);

		expect(s.users instanceof own.orm.Column).toBe(false);
		expect(s.users.id instanceof own.pg.PgText).toBe(false);
	});

	test('select with table and filters of another instance', () => {
		expect(viaForeign.select()).toStrictEqual(viaOwn.select());
	});

	test('partial select with sql fragment of another instance', () => {
		expect(viaForeign.partialSelect()).toStrictEqual(viaOwn.partialSelect());
	});

	test('sql template embedding chunks of another instance', () => {
		expect(viaForeign.sqlTemplate()).toStrictEqual(viaOwn.sqlTemplate());
	});

	test('joins with alias and subquery of another instance', () => {
		expect(viaForeign.joins()).toStrictEqual(viaOwn.joins());
	});

	test('select from view of another instance', () => {
		expect(viaForeign.view()).toStrictEqual(viaOwn.view());
	});

	test('insert into table of another instance', () => {
		expect(viaForeign.insert()).toStrictEqual(viaOwn.insert());
	});

	test('update table of another instance', () => {
		expect(viaForeign.update()).toStrictEqual(viaOwn.update());
	});

	test('delete from table of another instance', () => {
		expect(viaForeign.delete()).toStrictEqual(viaOwn.delete());
	});

	test('relational query over schema of another instance', () => {
		expect(viaForeign.relational()).toStrictEqual(viaOwn.relational());
	});
});
