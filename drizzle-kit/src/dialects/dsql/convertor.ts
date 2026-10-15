/**
 * DSQL SQL Convertor
 *
 * DSQL-specific SQL generation that overrides PostgreSQL convertors
 * for DSQL-unique requirements:
 * - CREATE INDEX ASYNC (instead of PostgreSQL's CONCURRENTLY)
 * - Only btree indexes supported
 * - No enums, policies, RLS
 * - Sequences require CACHE (must be 1 or >= 65536)
 * - Foreign keys and check constraints added with ALTER TABLE require NOT VALID
 * - Primary keys can only be defined in CREATE TABLE
 * - Limited ALTER TABLE support (no SET NOT NULL, SET DATA TYPE, etc.)
 */

import { convertor, fromJson as pgFromJson } from '../postgres/convertor';
import { defaults, isDefaultAction } from '../postgres/grammar';
import type { JsonStatement } from '../postgres/statements';

/**
 * DSQL-specific index convertor that uses ASYNC for non-blocking index creation.
 *
 * DSQL requires CREATE INDEX ASYNC for non-blocking index creation.
 * Unlike PostgreSQL's CONCURRENTLY which is optional, DSQL uses ASYNC
 * by default for all index creation.
 */
const createIndexConvertor = convertor('create_index', (st) => {
	const {
		schema,
		table,
		name,
		columns,
		isUnique,
		with: w,
		method,
		where,
	} = st.index;

	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';

	const value = columns
		.map((it) => {
			const expr = it.isExpression ? it.value : `"${it.value}"`;
			const opcl = it.opclass && !it.opclass.default ? ` ${it.opclass.name}` : '';

			// ASC - default
			const ord = it.asc ? '' : ' DESC';

			// skip if asc+nulls last or desc+nulls first
			const nulls = (it.asc && !it.nullsFirst) || (!it.asc && it.nullsFirst)
				? ''
				: it.nullsFirst
				? ' NULLS FIRST'
				: ' NULLS LAST';

			return `${expr}${opcl}${ord}${nulls}`;
		}).join(',');

	const key = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	// DSQL always uses ASYNC for index creation (non-blocking)
	const withClause = w ? ` WITH (${w})` : '';
	const whereClause = where ? ` WHERE ${where}` : '';
	const using = method !== defaults.index.method ? ` USING ${method}` : '';

	return `CREATE ${indexPart} ASYNC "${name}" ON ${key}${using} (${value})${withClause}${whereClause};`;
});

/**
 * DSQL-specific drop index convertor.
 * Uses the schema-qualified name for proper DSQL handling.
 */
const dropIndexConvertor = convertor('drop_index', (st) => {
	const { schema, name } = st.index;
	const key = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP INDEX ${key};`;
});

/**
 * DSQL-specific recreate index convertor.
 */
const recreateIndexConvertor = convertor('recreate_index', (st) => {
	const drop = dropIndexConvertor.convert({ index: st.index }) as string;
	const add = createIndexConvertor.convert({ index: st.index }) as string;
	return [drop, add];
});

/**
 * DSQL default cache value for sequences.
 * DSQL requires cache to be either 1 or >= 65536.
 */
const DSQL_DEFAULT_CACHE = 65536;

/**
 * DSQL-specific sequence convertor.
 * DSQL requires CACHE to be specified and must be 1 or >= 65536.
 */
const createSequenceConvertor = convertor('create_sequence', (st) => {
	const { name, schema, minValue, maxValue, incrementBy, startWith, cacheSize, cycle } = st.sequence;
	const sequenceWithSchema = schema && schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	// DSQL requires CACHE - use provided value or default to 65536
	const cache = cacheSize ?? DSQL_DEFAULT_CACHE;

	return `CREATE SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''} CACHE ${cache}${
		cycle ? ` CYCLE` : ''
	};`;
});

/**
 * DSQL-specific drop sequence convertor.
 */
const dropSequenceConvertor = convertor('drop_sequence', (st) => {
	const { name, schema } = st.sequence;
	const sequenceWithSchema = schema && schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP SEQUENCE ${sequenceWithSchema};`;
});

/**
 * DSQL-specific rename sequence convertor.
 */
const renameSequenceConvertor = convertor('rename_sequence', (st) => {
	const sequenceWithSchemaFrom = st.from.schema && st.from.schema !== 'public'
		? `"${st.from.schema}"."${st.from.name}"`
		: `"${st.from.name}"`;
	return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${st.to.name}";`;
});

/**
 * DSQL-specific move sequence convertor.
 */
const moveSequenceConvertor = convertor('move_sequence', (st) => {
	const { from, to } = st;
	const sequenceWithSchema = from.schema && from.schema !== 'public'
		? `"${from.schema}"."${from.name}"`
		: `"${from.name}"`;
	const seqSchemaTo = `"${to.schema}"`;
	return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
});

/**
 * DSQL-specific alter sequence convertor.
 * DSQL requires CACHE to be specified.
 */
const alterSequenceConvertor = convertor('alter_sequence', (st) => {
	const { schema, name, incrementBy, minValue, maxValue, startWith, cacheSize, cycle } = st.sequence;

	const sequenceWithSchema = schema && schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	// DSQL requires CACHE - use provided value or default to 65536
	const cache = cacheSize ?? DSQL_DEFAULT_CACHE;

	return `ALTER SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''} CACHE ${cache}${
		cycle ? ` CYCLE` : ''
	};`;
});

/**
 * Validates existing rows against a NOT VALID constraint.
 * DSQL runs the validation as an asynchronous job.
 */
const validateConstraint = (schema: string, table: string, name: string) => {
	const key = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;
	return `ALTER TABLE ASYNC ${key} VALIDATE CONSTRAINT "${name}";`;
};

/**
 * DSQL-specific foreign key convertor.
 * DSQL requires NOT VALID when adding a foreign key with ALTER TABLE.
 * The constraint applies to new rows immediately, then existing rows are validated asynchronously.
 */
const createForeignKeyConvertor = convertor('create_fk', (st) => {
	const { schema, table, name, tableTo, columns, columnsTo, onDelete, onUpdate, schemaTo } = st.fk;

	const onDeleteStatement = onDelete && !isDefaultAction(onDelete) ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate && !isDefaultAction(onUpdate) ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `"${it}"`).join(',');
	const toColumnsString = columnsTo.map((it) => `"${it}"`).join(',');

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const tableToNameWithSchema = schemaTo !== 'public'
		? `"${schemaTo}"."${tableTo}"`
		: `"${tableTo}"`;

	return [
		`ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement} NOT VALID;`,
		validateConstraint(schema, table, name),
	];
});

/**
 * DSQL-specific recreate foreign key convertor.
 */
const recreateForeignKeyConvertor = convertor('recreate_fk', (st) => {
	const { schema, table, name } = st.fk;
	const key = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;
	const drop = `ALTER TABLE ${key} DROP CONSTRAINT "${name}";`;
	const add = createForeignKeyConvertor.convert({ fk: st.fk }) as string[];
	return [drop, ...add];
});

/**
 * DSQL-specific check constraint convertor.
 * DSQL requires NOT VALID when adding a check constraint with ALTER TABLE.
 * The constraint applies to new rows immediately, then existing rows are validated asynchronously.
 */
const addCheckConvertor = convertor('add_check', (st) => {
	const { check } = st;
	const key = check.schema !== 'public' ? `"${check.schema}"."${check.table}"` : `"${check.table}"`;
	return [
		`ALTER TABLE ${key} ADD CONSTRAINT "${check.name}" CHECK (${check.value}) NOT VALID;`,
		validateConstraint(check.schema, check.table, check.name),
	];
});

/**
 * DSQL-specific recreate check constraint convertor.
 */
const recreateCheckConvertor = convertor('alter_check', (st) => {
	const check = st.diff.$right;
	const key = check.schema !== 'public' ? `"${check.schema}"."${check.table}"` : `"${check.table}"`;
	const drop = `ALTER TABLE ${key} DROP CONSTRAINT "${check.name}";`;
	const add = addCheckConvertor.convert({ check }) as string[];
	return [drop, ...add];
});

/**
 * List of DSQL-specific convertors that override PostgreSQL behavior.
 */
const dsqlConvertors = [
	createIndexConvertor,
	dropIndexConvertor,
	recreateIndexConvertor,
	createSequenceConvertor,
	dropSequenceConvertor,
	renameSequenceConvertor,
	moveSequenceConvertor,
	alterSequenceConvertor,
	createForeignKeyConvertor,
	recreateForeignKeyConvertor,
	addCheckConvertor,
	recreateCheckConvertor,
];

// Unsupported statement types in DSQL
const enumStatementTypes = [
	'create_enum',
	'drop_enum',
	'move_enum',
	'rename_enum',
	'recreate_enum',
	'alter_enum',
	'alter_type_drop_value',
] as const;

const policyStatementTypes = [
	'create_policy',
	'drop_policy',
	'rename_policy',
	'alter_policy',
	'recreate_policy',
	'alter_rls',
] as const;

const primaryKeyStatementTypes = [
	'add_pk',
	'drop_pk',
	'alter_pk',
] as const;

/**
 * Validates a statement and returns an error message if it's unsupported in DSQL.
 * Returns null if the statement is supported.
 */
function validateStatement(statement: JsonStatement): string | null {
	const st = statement as any;

	// Enum-related statements
	if ((enumStatementTypes as readonly string[]).includes(statement.type)) {
		return `DSQL does not support enums. Cannot perform ${statement.type} operation.`;
	}

	// Policy statements
	if ((policyStatementTypes as readonly string[]).includes(statement.type)) {
		return `DSQL does not support row-level security policies. Cannot perform ${statement.type} operation.`;
	}

	// Primary key statements - DSQL only supports primary keys defined in CREATE TABLE
	if ((primaryKeyStatementTypes as readonly string[]).includes(statement.type)) {
		return `DSQL does not support changing the primary key of an existing table. `
			+ `Cannot perform ${statement.type} operation. `
			+ `Consider recreating the table with the desired schema.`;
	}

	// ADD COLUMN with constraints
	if (statement.type === 'add_column') {
		const column = st.column;
		const key = column.schema !== 'public'
			? `"${column.schema}"."${column.table}"`
			: `"${column.table}"`;

		if (column.notNull) {
			return `DSQL does not support ADD COLUMN with NOT NULL constraint. `
				+ `Cannot add column "${column.name}" to table ${key} as NOT NULL. `
				+ `Consider recreating the table with the desired schema.`;
		}
		if (column.default) {
			return `DSQL does not support ADD COLUMN with DEFAULT constraint. `
				+ `Cannot add column "${column.name}" to table ${key} with a default value. `
				+ `Consider recreating the table with the desired schema.`;
		}
		if (column.generated) {
			return `DSQL does not support ADD COLUMN with GENERATED constraint. `
				+ `Cannot add column "${column.name}" to table ${key} as generated. `
				+ `Consider recreating the table with the desired schema.`;
		}
		if (column.identity) {
			return `DSQL does not support ADD COLUMN with IDENTITY constraint. `
				+ `Cannot add column "${column.name}" to table ${key} as identity. `
				+ `Consider recreating the table with the desired schema.`;
		}
	}

	// Index operations - DSQL only supports btree indexes
	if (statement.type === 'create_index' || statement.type === 'recreate_index') {
		const method = st.index?.method;
		if (method && method !== 'btree') {
			return `DSQL only supports btree indexes. Cannot create index with method '${method}'.`;
		}
	}

	// ALTER COLUMN operations
	if (statement.type === 'alter_column') {
		const { diff, to: column } = st;
		const key = column.schema !== 'public'
			? `"${column.schema}"."${column.table}"`
			: `"${column.table}"`;

		// DROP NOT NULL is supported, SET NOT NULL is not
		if (diff.notNull && diff.notNull.to) {
			return `DSQL does not support ALTER COLUMN SET NOT NULL. `
				+ `Cannot change nullability of column "${column.name}" in table ${key}. `
				+ `Consider recreating the table with the desired schema.`;
		}

		// ADD GENERATED AS IDENTITY requires the column to already be NOT NULL
		if (diff.identity && diff.identity.from === null && !diff.$left.notNull) {
			return `DSQL does not support adding IDENTITY to a nullable column. `
				+ `Cannot add identity to column "${column.name}" in table ${key}. `
				+ `Consider recreating the table with the desired schema.`;
		}

		if (diff.type) {
			return `DSQL does not support ALTER COLUMN SET DATA TYPE. `
				+ `Cannot change type of column "${column.name}" in table ${key}. `
				+ `Consider recreating the table with the desired schema.`;
		}
	}

	// RECREATE_COLUMN - DSQL doesn't support this operation
	if (statement.type === 'recreate_column') {
		return `DSQL does not support column recreation. `
			+ `Consider recreating the table with the desired schema.`;
	}

	return null;
}

/**
 * Converts JSON statements to DSQL-specific SQL.
 * Validates statements and collects errors for unsupported operations.
 */
export function fromJson(statements: JsonStatement[]) {
	const errors: string[] = [];

	const grouped = statements
		.map((statement) => {
			// Validate the statement
			const error = validateStatement(statement);
			if (error) {
				errors.push(error);
				return null;
			}

			// Check if we have a DSQL-specific convertor for this statement type
			const dsqlConvertor = dsqlConvertors.find((c) => c.can(statement));

			if (dsqlConvertor) {
				const sqlStatements = dsqlConvertor.convert(statement as any);
				const stmts = typeof sqlStatements === 'string' ? [sqlStatements] : sqlStatements;
				const filteredStmts = stmts.filter((s) => s && s.trim().length > 0);
				if (filteredStmts.length === 0) {
					return null;
				}
				return { jsonStatement: statement, sqlStatements: filteredStmts };
			}

			// Fall back to PostgreSQL convertor via pgFromJson for single statement
			const pgResult = pgFromJson([statement]);
			return {
				jsonStatement: statement,
				sqlStatements: pgResult.sqlStatements,
			};
		})
		.filter((it): it is NonNullable<typeof it> => it !== null);

	return {
		sqlStatements: grouped.map((it) => it.sqlStatements).flat(),
		groupedStatements: grouped,
		errors,
	};
}

export {
	addCheckConvertor,
	alterSequenceConvertor,
	createForeignKeyConvertor,
	createIndexConvertor,
	createSequenceConvertor,
	dropIndexConvertor,
	dropSequenceConvertor,
	moveSequenceConvertor,
	recreateCheckConvertor,
	recreateForeignKeyConvertor,
	recreateIndexConvertor,
	renameSequenceConvertor,
};
