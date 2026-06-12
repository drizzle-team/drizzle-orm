import { describe, expect, test } from 'vitest';
import { relations as relationsV1 } from '~/_relations.ts';
import { binary, datetime, int, mssqlTable, text } from '~/mssql-core';
import { drizzle } from '~/node-mssql';
import { defineRelations } from '~/relations';
import { sql } from '~/sql';

const users = mssqlTable('users', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	createdAt: datetime('created_at').notNull(),
});
const usersConfig = relationsV1(users, ({ many }) => ({
	posts: many(posts),
}));

const posts = mssqlTable('posts', {
	id: int('id').primaryKey(),
	title: text('title').notNull(),
	authorId: int('author_id').references(() => users.id),
});
const postsConfig = relationsV1(posts, ({ one }) => ({
	author: one(users, {
		fields: [posts.authorId],
		references: [users.id],
	}),
}));

const files = mssqlTable('files', {
	id: int('id').primaryKey(),
	data: binary('data'),
	createdAt: datetime('created_at').notNull(),
});
const filesConfig = relationsV1(files, () => ({}));

const schema = {
	files,
	filesConfig,
	posts,
	postsConfig,
	users,
	usersConfig,
};

const relations = defineRelations(schema, ({ files, many, one, posts, users }) => ({
	files: {},
	users: {
		posts: many.posts({ from: users.id, to: posts.authorId }),
	},
	posts: {
		author: one.users({ from: posts.authorId, to: users.id }),
	},
}));

const db = drizzle({ client: {} as any, schema, relations });

describe('mssql RQBv2', () => {
	test('builds nested relation SQL with SQL Server JSON primitives', () => {
		const query = db.query.users.findMany({
			columns: {
				id: true,
				name: true,
			},
			where: {
				posts: {
					title: {
						like: '%orm%',
					},
				},
			},
			orderBy: {
				name: 'asc',
			},
			offset: 5,
			limit: 10,
			with: {
				posts: {
					columns: {
						title: true,
					},
					limit: 2,
					extras: {
						titleLower: (posts, { sql }) => sql<string>`lower(${posts.title})`,
					},
					with: {
						author: {
							columns: {
								id: true,
								name: true,
							},
						},
					},
				},
			},
		}).toSQL();

		expect(query).toMatchInlineSnapshot(`
			{
			  "params": [
			    2,
			    1,
			    "%orm%",
			    5,
			    10,
			  ],
			  "sql": "select (select [d0].[id] as [id], [d0].[name] as [name], json_query([posts].[r]) as [posts] from [users] as [d0] outer apply (select json_query(coalesce((select [t].[title] as [title], [t].[titleLower] as [titleLower], json_query([t].[author]) as [author] from (select top(@par0) [d1].[title] as [title], (lower([d1].[title])) as [titleLower], json_query([author].[r]) as [author] from [posts] as [d1] outer apply (select json_query((select [t].[id] as [id], [t].[name] as [name] from (select top(@par1) [d2].[id] as [id], [d2].[name] as [name] from [users] as [d2] where [d1].[author_id] = [d2].[id]) as [t] for json path, include_null_values, without_array_wrapper)) as [r]) as [author] where [d0].[id] = [d1].[author_id]) as [t] for json path, include_null_values), '[]')) as [r]) as [posts] where exists (select top(1) * from [posts] as [f0] where (([d0].[id] = [f0].[author_id]) and ([f0].[title] like @par2))) order by [d0].[name] asc offset @par3 rows fetch next @par4 rows only for json path, include_null_values) as [data]",
			}
		`);
	});

	test('builds first relation SQL without array wrapper', () => {
		const query = db.query.posts.findFirst({
			columns: {
				id: true,
			},
			with: {
				author: {
					columns: {
						name: true,
					},
				},
			},
		}).toSQL();

		expect(query).toMatchInlineSnapshot(`
			{
			  "params": [
			    1,
			    1,
			  ],
			  "sql": "select (select top(@par0) [d0].[id] as [id], json_query([author].[r]) as [author] from [posts] as [d0] outer apply (select json_query((select [t].[name] as [name] from (select top(@par1) [d1].[name] as [name] from [users] as [d1] where [d0].[author_id] = [d1].[id]) as [t] for json path, include_null_values, without_array_wrapper)) as [r]) as [author] for json path, include_null_values) as [data]",
			}
		`);
	});

	test('preserves nested relation order with offset 0', () => {
		const query = db.query.users.findMany({
			columns: {
				id: true,
			},
			with: {
				posts: {
					columns: {
						id: true,
					},
					orderBy: {
						id: 'asc',
					},
				},
			},
		}).toSQL();

		expect(query.sql).toContain('order by [d1].[id] asc offset 0 rows');
	});

	test('uses primary key fallback order for offset without orderBy', () => {
		const query = db.query.users.findMany({
			columns: {
				id: true,
			},
			offset: 1,
			limit: 1,
		}).toSQL();

		expect(query.sql).toContain('order by [d0].[id] offset @par0 rows fetch next @par1 rows only');
		expect(query.sql).not.toContain('order by 1');
	});

	test('keeps V1 _query compilation path', () => {
		const query = db._query.users.findMany({
			limit: 1,
			with: {
				posts: true,
			},
		}).toSQL();

		expect(query.sql).toContain('for json auto, include_null_values');
		expect(query.sql).not.toContain('outer apply');
	});

	test('maps root FOR JSON values through MSSQL JSON mappers', () => {
		const relationalQuery = db.query.files.findMany();
		const { query } = (relationalQuery as any)._toSQL();
		const mapper = db.dialect.mapperGenerators.relationalRows({
			isFirst: false,
			parseJson: false,
			parseJsonIfString: false,
			rootJsonMappers: true,
			selection: query.selection,
		});

		const rows = mapper([{
			id: 1,
			data: Buffer.from('drizzle').toString('base64'),
			createdAt: '2026-06-12T12:34:56.000Z',
		}]);

		expect(rows).toEqual([{
			id: 1,
			data: Buffer.from('drizzle'),
			createdAt: new Date('2026-06-12T12:34:56.000Z'),
		}]);
	});
});
