import Database from 'better-sqlite3';
import { SQL, sql } from 'drizzle-orm';
import {
	AnySQLiteColumn,
	check,
	customType,
	foreignKey,
	index,
	int,
	integer,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	sqliteView,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import * as fs from 'fs';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { fromDatabaseForDrizzle } from 'src/dialects/sqlite/introspect';
import { expect, test } from 'vitest';
import { dbFrom, diffAfterPull, push } from './mocks';

fs.mkdirSync('tests/sqlite/tmp', { recursive: true });

test('introspect tables with fk constraint', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', {
		id: integer(),
		name: text(),
	});

	const posts = sqliteTable('posts', {
		id: integer(),
		userId: integer('user_id').references(() => users.id).references(() => users.id, {
			onDelete: 'no action',
			onUpdate: 'no action',
		}),
	});
	const schema = { users, posts };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'fk-tables');

	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3231
test('introspect tables with fk constraint #2', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);
	await db.run('CREATE TABLE `users`(`id` integer primary key);');
	await db.run('CREATE TABLE `posts`(`user_id` integer references `users` (`id`));');

	const schema = await fromDatabaseForDrizzle(db, () => true, () => {}, {
		table: '__drizzle_migrations',
		schema: 'drizzle',
	});
	const { ddl, errors } = interimToDDL(schema);

	expect(errors.length).toBe(0);
	expect(ddl.tables.list().length).toBe(2);
	expect(ddl.columns.list().length).toBe(2);

	expect(ddl.fks.list().length).toBe(1);
	expect(ddl.fks.list()).toStrictEqual([
		{
			table: 'posts',
			columns: ['user_id'],
			tableTo: 'users',
			columnsTo: ['id'],
			onUpdate: 'NO ACTION',
			onDelete: 'NO ACTION',
			nameExplicit: true,
			name: 'fk_posts_user_id_users_id_fk',
			entityType: 'fks',
		},
	]);

	expect(ddl.pks.list().length).toBe(1);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4247
test('introspect table with self reference', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', {
		id: integer(),
		name: text(),
		invited_id: integer().references((): AnySQLiteColumn => users.id),
	});

	const schema = { users };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'self-ref-table');

	expect(sqlStatements).toStrictEqual([]);
});

test('introspect table fk on multiple columns', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', {
		id: integer(),
		name: text(),
		invited_id: integer(),
	});

	const ref = sqliteTable('ref', {
		id: integer(),
		name: text(),
		invited_id: integer(),
	}, (t) => [foreignKey({ columns: [t.name, t.invited_id], foreignColumns: [users.name, users.invited_id] })]);

	const schema = { users, ref };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'composite-fk');

	expect(sqlStatements).toStrictEqual([]);
});

test('composite fk introspect self ref', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', {
		id: integer(),
		name: text(),
		invited_id: integer(),
	}, (t) => [foreignKey({ columns: [t.name, t.invited_id], foreignColumns: [t.name, t.invited_id] })]);

	const schema = { users };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'composite-fk-self-ref');

	expect(sqlStatements).toStrictEqual([]);
});

test('generated always column: link to another column', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs((): SQL => sql`\`email\``),
		}),
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'generated-link-column');

	expect(sqlStatements).toStrictEqual([]);
});

test('generated always column virtual: link to another column', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs((): SQL => sql`\`email\``, { mode: 'virtual' }),
		}),
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'generated-link-column-virtual');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('complex generated always', async () => {
	const sqlite = new Database(':memory:');

	const generatedExpression = `trim(
		coalesce(\`first_name\`, '') || ' ' || coalesce(\`last_name\`, '') ||
		(CASE WHEN nullif(trim(coalesce(\`suffix\`, '')), '') IS NOT NULL THEN ' ' || trim(coalesce(\`suffix\`, '')) ELSE '' END)
	)`;

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			firstName: text('first_name'),
			lastName: text('last_name'),
			suffix: text('suffix'),
			fullName: text('full_name').generatedAlwaysAs((): SQL => sql.raw(generatedExpression), { mode: 'virtual' }),
		}),
	};

	const { statements, sqlStatements, initDDL, resultDdl } = await diffAfterPull(
		sqlite,
		schema,
		'complex generated always',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(
		initDDL.columns.one({ name: 'full_name' })?.generated,
	).toEqual({
		as: `(${generatedExpression})`,
		type: 'virtual',
	});
	expect(
		resultDdl.columns.one({ name: 'full_name' })?.generated,
	).toEqual({
		as: `(${generatedExpression})`,
		type: 'virtual',
	});
});

test('instrospect strings with single quotes', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		columns: sqliteTable('columns', {
			text: text('text').default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'introspect-strings-with-single-quotes');

	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4582
test('introspect checks', async () => {
	const sqlite = new Database(':memory:');

	const initSchema = {
		users: sqliteTable(
			'users',
			{
				id: int('id'),
				name: text('name'),
				age: int('age'),
			},
			(
				table,
			) => [check('some_check1', sql`${table.age} > 21`), check('some_check2', sql`${table.age} IN (21, 22, 23)`)],
		),
	};

	const db = dbFrom(sqlite);
	await push({
		db,
		to: initSchema,
	});

	const schema = await fromDatabaseForDrizzle(db, () => true, () => {}, {
		table: '__drizzle_migrations',
		schema: 'drizzle',
	});
	const { ddl, errors } = interimToDDL(schema);

	expect(errors.length).toBe(0);
	expect(ddl.checks.list().length).toBe(2);
	expect(ddl.checks.list()[0].name).toBe('some_check1');
	expect(ddl.checks.list()[0].value).toBe('"age" > 21');
	expect(ddl.checks.list()[1].name).toBe('some_check2');
	expect(ddl.checks.list()[1].value).toBe('"age" IN (21, 22, 23)');
});

test('view #1', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', { id: int('id') });
	const testView = sqliteView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`);
	// view with \n newlines
	const testView2 = sqliteView('some_view2', { id: int('id') }).as(
		sql`SELECT\n*\nFROM\n${users}`,
	);
	const testView3 = sqliteView('some_view3', { id: int('id') }).as(
		sql`WITH temp as (SELECT 1) SELECT\n*\nFROM\n${users}`,
	);

	const schema = {
		users: users,
		testView,
		testView2,
		testView3,
	};

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'view-1');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3674
test('view #2', async () => {
	const sqlite = new Database(':memory:');

	const userLogs = sqliteTable('user_logs', {
		id: text().primaryKey(),
		userId: text('user_id').notNull(),
		type: text().notNull(),
		entry: text().notNull(),
		dtTimestamp: integer('dt_timestamp').notNull(),
	});

	const latestUserLogs = sqliteView('latest_user_logs', {
		id: text(),
		userId: text(),
		entry: text(),
		dtTimestamp: integer(),
	}).as(sql`WITH ranked_logs AS (
  SELECT
	ul.id,
	ul.user_id,
	ul.entry,
	ul.dt_timestamp,
	ROW_NUMBER() OVER (
	  PARTITION BY
		ul.user_id,
		ul.type,
		date(datetime(ul.dt_timestamp, 'unixepoch'))
	  ORDER BY ul.dt_timestamp DESC
	) AS rn
  FROM user_logs ul
)
SELECT
  id,
  user_id,
  entry,
  dt_timestamp
FROM ranked_logs
WHERE rn = 1
ORDER BY dt_timestamp DESC`);

	const schema = { userLogs, latestUserLogs };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'view-2');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4582
test('view #3 aggregate function', async () => {
	const sqlite = new Database(':memory:');

	const orderDetails = sqliteTable(
		'Order Details',
		{
			orderId: integer('OrderID').notNull(),
			productId: integer('ProductID').notNull(),
			unitPrice: numeric('UnitPrice', { mode: 'number' }).default(0).notNull(),
			quantity: integer('Quantity').default(1).notNull(),
			discount: real('Discount').default(0).notNull(),
		},
		(
			table,
		) => [
			primaryKey({ columns: [table.orderId, table.productId], name: 'Order Details_pk' }),
			check('Order Details_check_1', sql`[Discount]>=(0) AND [Discount]<=(1)`),
			check('Order Details_check_2', sql`[Quantity]>(0)`),
			check('Order Details_check_3', sql`[UnitPrice]>=(0)`),
		],
	);

	const orderSubtotals = sqliteView('Order Subtotals', {
		orderId: integer(),
		subtotal: real(), // It seems that the aggregated column type of a view is not stored in the database.
		// Instead, you can only determine its runtime storage class by running the following query once the view has rows.
		// SELECT typeof(Subtotal) FROM [Order Subtotals];
	}).as(sql`SELECT [Order Details].OrderID,
		Sum(([Order Details].UnitPrice*Quantity*(1-Discount)/100)*100) AS Subtotal
		FROM [Order Details]
		GROUP BY [Order Details].OrderID`);

	const schema = { orderDetails, orderSubtotals };

	const { statements, sqlStatements } = await diffAfterPull(sqlite, schema, 'view-3');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('broken view', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', { id: int('id') });
	const testView1 = sqliteView('some_view1', { id: int('id') }).as(sql`SELECT id FROM ${users}`);
	const testView2 = sqliteView('some_view2', { id: int('id'), name: text('name') }).as(
		sql`SELECT id, name FROM ${users}`,
	);

	const schema = {
		users: users,
		testView1,
		testView2,
	};

	const { statements, sqlStatements, resultDdl } = await diffAfterPull(sqlite, schema, 'broken-view');

	expect(
		resultDdl.views.one({
			name: 'some_view2',
		})?.error,
	).toBeTypeOf('string');
	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5053
test('single quote default', async () => {
	const sqlite = new Database(':memory:');

	const group = sqliteTable('group', {
		id: text().notNull(),
		fk_organizaton_group: text().notNull(),
		saml_identifier: text().default('').notNull(),
		display_name: text().default('').notNull(),
	});

	const { sqlStatements } = await diffAfterPull(sqlite, { group }, 'single_quote_default');

	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2827
test('introspect text type', async () => {
	const sqlite = new Database(':memory:');

	const table = sqliteTable('table', {
		text1: text().notNull().default(sql`CURRENT_TIMESTAMP`),
		text2: text().default(''),
		text3: text().default('``'),
	});

	const { sqlStatements } = await diffAfterPull(sqlite, { table }, 'introspect_text_type');

	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3590
test('introspect composite pk + check', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		table2: sqliteTable('table2', {
			column1: text().notNull(),
			column2: text().notNull(),
			column3: text().notNull(),
		}, (table) => [
			primaryKey({ columns: [table.column1, table.column2], name: 'table2_pk' }),
			check('table2_check_1', sql`"column3" IN ('1', '2')`),
		]),
	};

	const { sqlStatements } = await diffAfterPull(sqlite, schema, 'introspect_composite_pk_check');

	expect(sqlStatements).toStrictEqual([]);
});

test('introspect unique constraint', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		table: sqliteTable('table', {
			col1: integer('col1').primaryKey(),
			col2: text('col2').notNull(),
		}, (t) => [
			uniqueIndex('some_idx1').on(t.col2),
			index('some_idx2').on(sql`lower(${t.col2})`),
			uniqueIndex('some_idx3').on(sql`lower(${t.col2})`),
			index('some_idx4').on(sql`lower(${t.col2})`, t.col1),
			uniqueIndex('some_idx5').on(sql`lower(${t.col2})`, t.col1),
		]),
	};

	const { sqlStatements } = await diffAfterPull(sqlite, schema, 'introspect_unique_constraint');
	expect(sqlStatements).toStrictEqual([]);
});

test('introspect expression and partial indexes', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		table: sqliteTable('table', {
			col1: text('col1'),
			col2: integer('col2'),
		}, (t) => [
			index('expr_idx').on(sql`lower(${t.col1})`),
			index('partial_idx').on(t.col2).where(sql`"col2" > 3`),
			index('mixed_idx').on(t.col1, sql`abs(${t.col2})`).where(sql`"col1" is not null`),
			uniqueIndex('uniq_expr_idx').on(sql`lower(${t.col1})`, t.col2),
		]),
	};

	const { sqlStatements } = await diffAfterPull(sqlite, schema, 'introspect_expression_indexes');
	expect(sqlStatements).toStrictEqual([]);
});

test('introspect index without a predicate', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	// `where` of an index only comes from its own ddl, `partial` of pragma_index_list tells there is one
	await db.run(`CREATE TABLE \`t\`(\`c\` text default 'ask where it came from');`);
	await db.run('CREATE INDEX `i` ON `t` (`c`);');
	await db.run(`CREATE INDEX \`i2\` ON \`t\` (lower('a where b')) WHERE \`c\` <> 'c where d';`);

	const schema = await fromDatabaseForDrizzle(db, () => true, () => {}, {
		table: '__drizzle_migrations',
		schema: 'drizzle',
	});
	const { ddl, errors } = interimToDDL(schema);

	expect(errors.length).toBe(0);
	expect(ddl.indexes.list()).toStrictEqual([
		{
			entityType: 'indexes',
			table: 't',
			name: 'i2',
			columns: [{ value: `lower('a where b')`, isExpression: true }],
			isUnique: false,
			origin: 'manual',
			where: `\`c\` <> 'c where d'`,
		},
		{
			entityType: 'indexes',
			table: 't',
			name: 'i',
			columns: [{ value: 'c', isExpression: false }],
			isUnique: false,
			origin: 'manual',
			where: null,
		},
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3047
test('create table with custom type column', async (t) => {
	const sqlite = new Database(':memory:');

	const f32Blob = customType<{
		data: number[];
		config: {
			length: number;
		};
		configRequired: true;
	}>({
		dataType(conf: { length: number }) {
			return `F32_BLOB(${conf.length})`;
		},
		fromDriver(value: Buffer) {
			const fArr = new Float32Array(new Uint8Array(value).buffer);
			return Array.from(fArr);
		},

		toDriver(value: number[]) {
			return Buffer.from(new Float32Array(value).buffer);
		},
	});
	const schema = {
		table1: sqliteTable('table1', {
			id: text('id').primaryKey(),
			blob: f32Blob('blob', {
				length: 10,
			}),
		}),
	};

	const { sqlStatements } = await diffAfterPull(sqlite, schema, 'table-with-custom-type-column');
	expect(sqlStatements).toStrictEqual([]);
});

// filter default migration table
test('pull after migrate with custom migrations table #1', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`
		CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);
	await db.run(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const { pks, columns, tables } = await fromDatabaseForDrizzle(
		db,
		() => true,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect([...tables, ...pks]).toStrictEqual([
		{
			entityType: 'tables',
			name: 'users',
		},
	]);
});

// filter custom migration table
test('pull after migrate with custom migrations table #2', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`
		CREATE TABLE IF NOT EXISTS custom_migrations (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);
	await db.run(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const { tables, pks } = await fromDatabaseForDrizzle(
		db,
		() => true,
		() => {},
		{
			table: 'custom_migrations',
			schema: 'drizzle', // default from prepare params
		},
	);

	expect([...tables, ...pks]).toStrictEqual([
		{
			entityType: 'tables',
			name: 'users',
		},
	]);
});

test('primary key with non default name', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`
CREATE TABLE table1 (
	id int,
	CONSTRAINT primary_key PRIMARY KEY (id)
);`);
	await db.run(`
CREATE TABLE table2 (
	id int primary key
);
`);

	const {
		sqlStatements,
		statements,
	} = await diffAfterPull(sqlite, {}, 'primary-key-without-default-name');

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3407
test('Issue No3407', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	// commented-out constraints must NOT be introspected, regardless of comment style
	await db.run(`CREATE TABLE IF NOT EXISTS users
                (
                    id       TEXT PRIMARY KEY,
                    -- CHECK (userType IN ('anonymous', 'emailPassword'))
                    -- UNIQUE (userType)
                    /* CHECK (length(userType) > 0) */
                    /* multi
                       line CONSTRAINT users_uq UNIQUE (id, userType)
                       FOREIGN KEY (userType) REFERENCES demo(id) */
                    userType TEXT NOT NULL -- CONSTRAINT users_ck CHECK (userType <> '')
                );
`);

	await db.run(`CREATE TABLE IF NOT EXISTS demo
                (
                    id                 TEXT PRIMARY KEY
                    -- , name TEXT UNIQUE
                    /* , FOREIGN KEY (id) REFERENCES users(id) */
                );
                `);

	await db.run(`CREATE TABLE users3 (
  id       TEXT PRIMARY KEY,
  -- CHECK (userType IN ('anonymous', 'emailPassword'))
  userType TEXT NOT NULL
);`);

	const {
		sqlStatements,
		statements,
		ddlAfterPull,
		resultDdl,
	} = await diffAfterPull(sqlite, {}, 'Issue #3407');

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);
	expect(ddlAfterPull.checks.list()).toStrictEqual([]);
	expect(ddlAfterPull.uniques.list()).toStrictEqual([]);
	expect(ddlAfterPull.fks.list()).toStrictEqual([]);
	expect(resultDdl.checks.list()).toStrictEqual([]);
	expect(resultDdl.uniques.list()).toStrictEqual([]);
	expect(resultDdl.fks.list()).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3231
test('Issue No3231', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`CREATE TABLE users(id integer primary key);`);
	await db.run(`CREATE TABLE posts(user_id integer references users);`); // valid syntax

	const {
		sqlStatements,
		statements,
		ddlAfterPull,
		resultDdl,
	} = await diffAfterPull(sqlite, {}, 'Issue #3231');

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);
});
test('Issue No3231 #2', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`CREATE TABLE users(id integer);`);
	await db.run(`CREATE TABLE posts(user_id integer references users);`); // valid syntax

	await expect(diffAfterPull(sqlite, {}, 'Issue #3231-2')).rejects.to.toThrowError(
		'Table users has no primary key, so the foreign key from posts.user_id to users cannot be resolved',
	);
});

// https://github.com/drizzle-team/drizzle-orm/issues/6182
test('Issue No6182', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`CREATE TABLE IF NOT EXISTS session_prompt (
		error BOOLEAN NOT NULL DEFAULT false,
		success BOOLEAN NOT NULL DEFAULT true,
		wrong_data BOOLEAN NOT NULL DEFAULT FALSE,
		wrong_data2 BOOLEAN NOT NULL DEFAULT 'FALSE',
		wrong_data3 BOOLEAN NOT NULL DEFAULT 'faLse'
	);
`);

	const { ddlAfterPull, initDDL, resultDdl, sqlStatements, statements } = await diffAfterPull(
		sqlite,
		{},
		'Issue #6182',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
	expect(ddlAfterPull.columns.list()).toStrictEqual([
		{
			autoincrement: false,
			default: '0',
			entityType: 'columns',
			generated: null,
			name: 'error',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: '1',
			entityType: 'columns',
			generated: null,
			name: 'success',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: '0',
			entityType: 'columns',
			generated: null,
			name: 'wrong_data',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: "'FALSE'",
			entityType: 'columns',
			generated: null,
			name: 'wrong_data2',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: "'faLse'",
			entityType: 'columns',
			generated: null,
			name: 'wrong_data3',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
	]);
	expect(resultDdl.columns.list()).toStrictEqual([
		{
			autoincrement: false,
			default: '0',
			entityType: 'columns',
			generated: null,
			name: 'error',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: '1',
			entityType: 'columns',
			generated: null,
			name: 'success',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: '0',
			entityType: 'columns',
			generated: null,
			name: 'wrong_data',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: "'FALSE'",
			entityType: 'columns',
			generated: null,
			name: 'wrong_data2',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
		{
			autoincrement: false,
			default: "'faLse'",
			entityType: 'columns',
			generated: null,
			name: 'wrong_data3',
			notNull: true,
			table: 'session_prompt',
			type: 'numeric',
		},
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/6195
test('Issue No6195', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(`CREATE TABLE t (a TEXT CHECK(a <> ''), b INTEGER, CHECK (b > 0));`);
	await db.run(`CREATE TABLE two (a INTEGER, CHECK (  a >
		 0), CHECK (a < 10));`);
	await db.run(`CREATE TABLE multi (b INTEGER, CHECK (
  b > 0
));`);

	const { ddlAfterPull, initDDL, resultDdl, sqlStatements, statements } = await diffAfterPull(
		sqlite,
		{},
		'Issue #6195',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
	expect(ddlAfterPull.checks.list({ table: 't' })).toStrictEqual([{
		entityType: 'checks',
		name: 't_check_1',
		table: 't',
		value: "a <> ''",
	}, {
		entityType: 'checks',
		name: 't_check_2',
		table: 't',
		value: 'b > 0',
	}]);
	expect(ddlAfterPull.checks.list({ table: 'two' })).toStrictEqual([
		{
			entityType: 'checks',
			name: 'two_check_3',
			table: 'two',
			value: 'a > 0',
		},
		{
			entityType: 'checks',
			name: 'two_check_4',
			table: 'two',
			value: 'a < 10',
		},
	]);
	expect(ddlAfterPull.checks.list({ table: 'multi' })).toStrictEqual([
		{
			entityType: 'checks',
			name: 'multi_check_5',
			table: 'multi',
			value: 'b > 0',
		},
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/6223
test('Issue No6223', async () => {
	const sqlite = new Database(':memory:');
	const db = dbFrom(sqlite);

	await db.run(
		`CREATE TABLE table1 (id INTEGER PRIMARY KEY, code TEXT NOT NULL, note TEXT DEFAULT 'ask where it came from');`,
	);
	await db.run(`CREATE INDEX index1 ON table1 (code);`);

	await db.run(`CREATE TABLE table2 (id INTEGER PRIMARY KEY, code TEXT NOT NULL, status TEXT);`);
	await db.run(`CREATE UNIQUE INDEX index2 ON table2 (code) WHERE status = 'active';`);

	const { ddlAfterPull, initDDL, resultDdl, sqlStatements, statements } = await diffAfterPull(
		sqlite,
		{},
		'Issue #6223',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
	expect(ddlAfterPull.indexes.list()).toStrictEqual([
		{
			columns: [
				{
					isExpression: false,
					value: 'code',
				},
			],
			entityType: 'indexes',
			isUnique: false,
			name: 'index1',
			origin: 'manual',
			table: 'table1',
			where: null,
		},
		{
			columns: [
				{
					isExpression: false,
					value: 'code',
				},
			],
			entityType: 'indexes',
			isUnique: true,
			name: 'index2',
			origin: 'manual',
			table: 'table2',
			where: "status = 'active'",
		},
	]);
});
