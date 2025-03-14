import { SQL, sql } from 'drizzle-orm';
import { googlesqlTable, int64, string } from 'drizzle-orm/googlesql';
import { expect, test } from 'vitest';
import { diffTestSchemasGooglesql } from './schemaDiffer';

test('generated as callback: add column with generated constraint', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: "`name` || 'hello'",
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				primaryKey: false,
				type: 'string(MAX)',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD COLUMN `gen_name` string(MAX) AS (`name` || 'hello') STORED;",
	]);
});

test('generated as callback: add generated constraint to an exisiting column as stored - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').notNull(),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an existing column to a generated column',
	);
});

test('generated as callback: add generated constraint to an exisiting column as virtual - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').notNull(),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name')
				.notNull()
				.generatedAlwaysAs((): SQL => sql`${from.users.name} || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an existing column to a generated column',
	);
});

test('generated as callback: drop generated constraint as stored - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName1: string('gen_name'),
		}),
	};
	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an generated column to a non-generated column',
	);
});

test('generated as callback: drop generated constraint as virtual - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name} || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName1: string('gen_name'),
		}),
	};
	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an generated column to a non-generated column',
	);
});

test('generated as callback: change generated constraint type from virtual to stored - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

test('generated as callback: change generated constraint type from stored to virtual - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

test('generated as callback: change generated constraint - ERROR', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${from.users.name}`,
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				(): SQL => sql`${to.users.name} || 'hello'`,
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

// ---

test('generated as sql: add column with generated constraint', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: "`name` || 'hello'",
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				primaryKey: false,
				type: 'string(MAX)',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD COLUMN `gen_name` string(MAX) AS (`name` || 'hello') STORED;",
	]);
});

test('generated as sql: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').notNull(),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\`name\` || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an existing column to a generated column',
	);
});

test('generated as sql: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').notNull(),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name')
				.notNull()
				.generatedAlwaysAs(sql`\`name\` || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an existing column to a generated column',
	);
});

test('generated as sql: drop generated constraint as stored', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\` || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName1: string('gen_name'),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an generated column to a non-generated column',
	);
});

test('generated as sql: drop generated constraint as virtual', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\` || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName1: string('gen_name'),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an generated column to a non-generated column',
	);
});

test('generated as sql: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\``,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

test('generated as sql: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\``,
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\` || 'hello'`,
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

test('generated as sql: change generated constraint', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\``,
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				sql`\`name\` || 'hello'`,
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

// ---

test('generated as string: add column with generated constraint', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				`\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(
		from,
		to,
		[],
	);

	expect(statements).toStrictEqual([
		{
			column: {
				generated: {
					as: "`name` || 'hello'",
					type: 'stored',
				},
				name: 'gen_name',
				notNull: false,
				primaryKey: false,
				type: 'string(MAX)',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE `users` ADD COLUMN `gen_name` string(MAX) AS (`name` || 'hello') STORED;",
	]);
});

test('generated as string: add generated constraint to an exisiting column as stored', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').notNull(),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name')
				.notNull()
				.generatedAlwaysAs(`\`name\` || 'to add'`, {
					mode: 'stored',
				}),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an existing column to a generated column',
	);
});

test('generated as string: add generated constraint to an exisiting column as virtual', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').notNull(),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name')
				.notNull()
				.generatedAlwaysAs(`\`name\` || 'to add'`, {
					mode: 'virtual',
				}),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an existing column to a generated column',
	);
});

test('generated as string: drop generated constraint as stored', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				`\`name\` || 'to delete'`,
				{ mode: 'stored' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName1: string('gen_name'),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an generated column to a non-generated column',
	);
});

test('generated as string: drop generated constraint as virtual', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				`\`name\` || 'to delete'`,
				{ mode: 'virtual' },
			),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName1: string('gen_name'),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		'Google Cloud Spanner does not support transform an generated column to a non-generated column',
	);
});

test('generated as string: change generated constraint type from virtual to stored', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(`\`name\``, {
				mode: 'virtual',
			}),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				`\`name\` || 'hello'`,
				{ mode: 'stored' },
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

test('generated as string: change generated constraint type from stored to virtual', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(`\`name\``),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				`\`name\` || 'hello'`,
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});

test('generated as string: change generated constraint', async () => {
	const from = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(`\`name\``),
		}),
	};
	const to = {
		users: googlesqlTable('users', {
			id: int64('id'),
			id2: int64('id2'),
			name: string('name'),
			generatedName: string('gen_name').generatedAlwaysAs(
				`\`name\` || 'hello'`,
			),
		}),
	};

	await expect(diffTestSchemasGooglesql(from, to, [])).rejects.toThrowError(
		"Google Cloud Spanner doesn't support changing stored generated columns",
	);
});
