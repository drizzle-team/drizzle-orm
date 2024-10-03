import { sql } from 'drizzle-orm';
import {
	bigint,
	foreignKey,
	index,
	int,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	text,
	unique,
} from 'drizzle-orm/mysql-core';
import { prepareFromExports } from 'src/serializer/mysqlImports';
import { SchemaValidationErrors as Err } from 'src/validate-schema/errors';
import { validateMySqlSchema } from 'src/validate-schema/validate';
import { expect, test } from 'vitest';

test('schema entity name collisions #1', () => {
	const schema = {
		table1: mysqlTable('test', {
			id: serial().primaryKey(),
		}),
		table2: mysqlTable('test', {
			id: serial().primaryKey(),
		}),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.SchemaEntityNameCollisions);
});

test('schema entity name collisions #2', () => {
	const schema = {
		table: mysqlTable('test', {
			id: serial().primaryKey(),
		}),
		view: mysqlView('test', {
			id: serial().primaryKey(),
		}).as(sql``),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.SchemaEntityNameCollisions);
});

test('schema constraint name collisions #1', () => {
	const schema = {
		table1: mysqlTable('test1', {
			id: serial().primaryKey(),
			name: text('name').notNull(),
		}, (table) => ({
			idx: index('name_idx').on(table.name),
		})),
		table2: mysqlTable('test2', {
			id: serial().primaryKey(),
			name: text('name').notNull(),
		}, (table) => ({
			idx: index('name_idx').on(table.name),
		})),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.SchemaConstraintNameCollisions);
});

test('schema constraint name collisions #2', () => {
	const schema = {
		table1: mysqlTable('test1', {
			id: serial().primaryKey(),
			name: text('name').notNull(),
		}, (table) => ({
			idx: index('test1_name_idx').on(table.name),
		})),
		table2: mysqlTable('test2', {
			id: serial().primaryKey(),
			name: text('name').notNull(),
		}, (table) => ({
			unique: unique('test2_name_idx').on(table.name),
		})),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.SchemaConstraintNameCollisions);
});

test('table column name collisions #1', () => {
	const schema = {
		table: mysqlTable('test', {
			id: serial().primaryKey(),
			firstName: text('first_name').notNull(),
			lastName: text('last_name').notNull(),
		}),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #2', () => {
	const schema = {
		table: mysqlTable('test', {
			id: serial().primaryKey(),
			firstName: text('first_name').notNull(),
			lastName: text('first_name').notNull(),
		}),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #3', () => {
	const schema = {
		table: mysqlTable('test', {
			id: serial().primaryKey(),
			firstName: text('last_name').notNull(),
			lastName: text().notNull(),
		}),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #4', () => {
	const schema = {
		table: mysqlTable('test', {
			id: serial().primaryKey(),
			firstName: text('last_name').notNull(),
			lastName: text().notNull(),
		}),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		'snake_case',
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.TableColumnNameCollisions);
});

test('table column name collisions #5', () => {
	const schema = {
		table: mysqlTable('test', {
			id: serial().primaryKey(),
			first_name: text('lastName').notNull(),
			last_name: text().notNull(),
		}),
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		'camelCase',
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.TableColumnNameCollisions);
});

test('foreign key mismatching column count #2', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: int().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table.c1, table.c2],
			foreignColumns: [table2.c1, table2.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: int().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.ForeignKeyMismatchingColumnCount);
});

test('foreign key mismatching data types #1', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: int().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table.c1, table.c2],
			foreignColumns: [table2.c1, table2.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.ForeignKeyMismatchingDataTypes);
});

test('foreign key mismatching data types #2', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table.c1, table.c2],
			foreignColumns: [table2.c1, table2.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.ForeignKeyMismatchingDataTypes);
});

test('foreign key mismatching data types #3', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
	});
	const table2 = mysqlTable('test2', {
		id: serial().primaryKey(),
		table1Id: bigint({ mode: 'number', unsigned: true }).notNull().references(() => table1.id),
	});
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.ForeignKeyMismatchingDataTypes);
});

test('foreign key columns mixing tables #1', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table.c1, table.c2],
			foreignColumns: [table2.c1, table2.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(0);
	expect(codes).not.contains(Err.ForeignKeyColumnsMixingTables);
	expect(codes).not.contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('foreign key columns mixing tables #2', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table2.c1, table.c2],
			foreignColumns: [table2.c1, table2.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.ForeignKeyColumnsMixingTables);
	expect(codes).not.contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('foreign key columns mixing tables #3', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table.c1, table.c2],
			foreignColumns: [table2.c1, table.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).not.contains(Err.ForeignKeyColumnsMixingTables);
	expect(codes).contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('foreign key columns mixing tables #4', () => {
	const table1 = mysqlTable('test1', {
		id: serial().primaryKey(),
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		fk: foreignKey({
			columns: [table.c1, table2.c2],
			foreignColumns: [table2.c1, table.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.c1, table.c2],
		}),
	}));
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(2);
	expect(codes).contains(Err.ForeignKeyColumnsMixingTables);
	expect(codes).contains(Err.ForeignKeyForeignColumnsMixingTables);
});

test('primary key columns mixing tables #1', () => {
	const table1 = mysqlTable('test1', {
		c1: int().notNull(),
		c2: text().notNull(),
	}, (table) => ({
		fk: primaryKey({
			columns: [table2.c1, table.c2],
		}),
	}));
	const table2 = mysqlTable('test2', {
		c1: int().notNull(),
	});
	const schema = {
		table1,
		table2,
	};

	const { tables, views } = prepareFromExports(schema);

	const { messages, codes } = validateMySqlSchema(
		undefined,
		tables,
		views,
	);

	expect(messages).length(1);
	expect(codes).contains(Err.PrimaryKeyColumnsMixingTables);
});
