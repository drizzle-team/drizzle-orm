/**
 * DSQL SQL Convertor
 *
 * DSQL-specific SQL generation that overrides PostgreSQL convertors
 * for DSQL-unique requirements:
 * - CREATE INDEX ASYNC (instead of PostgreSQL's CONCURRENTLY)
 * - Only btree indexes supported
 * - No enums, sequences, foreign keys, policies, RLS
 * - Limited ALTER TABLE support (no SET NOT NULL, SET DEFAULT, etc.)
 */

import { convertor, fromJson as pgFromJson } from '../postgres/convertor';
import { defaults } from '../postgres/grammar';
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
 * List of DSQL-specific convertors that override PostgreSQL behavior.
 */
const dsqlConvertors = [
	createIndexConvertor,
	dropIndexConvertor,
	recreateIndexConvertor,
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

const sequenceStatementTypes = [
	'create_sequence',
	'drop_sequence',
	'move_sequence',
	'rename_sequence',
	'alter_sequence',
] as const;

const policyStatementTypes = [
	'create_policy',
	'drop_policy',
	'rename_policy',
	'alter_policy',
	'recreate_policy',
	'alter_rls',
] as const;

const fkStatementTypes = [
	'create_fk',
	'drop_fk',
	'recreate_fk',
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

	// Sequence-related statements
	if ((sequenceStatementTypes as readonly string[]).includes(statement.type)) {
		return `DSQL does not support sequences. Cannot perform ${statement.type} operation.`;
	}

	// Foreign key statements
	if ((fkStatementTypes as readonly string[]).includes(statement.type)) {
		return `DSQL does not support foreign keys. Cannot perform ${statement.type} operation.`;
	}

	// Policy statements
	if ((policyStatementTypes as readonly string[]).includes(statement.type)) {
		return `DSQL does not support row-level security policies. Cannot perform ${statement.type} operation.`;
	}

	// DROP COLUMN
	if (statement.type === 'drop_column') {
		const column = st.column;
		const key = column.schema !== 'public'
			? `"${column.schema}"."${column.table}"`
			: `"${column.table}"`;
		return `DSQL does not support DROP COLUMN. `
			+ `Cannot drop column "${column.name}" from table ${key}. `
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
			return `DSQL does not support identity columns. `
				+ `Cannot add column "${column.name}" to table ${key} with identity. `
				+ `Consider using UUID with gen_random_uuid() instead.`;
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

		if (diff.notNull) {
			const action = diff.notNull.to ? 'SET NOT NULL' : 'DROP NOT NULL';
			return `DSQL does not support ALTER COLUMN ${action}. `
				+ `Cannot change nullability of column "${column.name}" in table ${key}. `
				+ `Consider recreating the table with the desired schema.`;
		}

		if (diff.default) {
			const action = diff.default.to ? 'SET DEFAULT' : 'DROP DEFAULT';
			return `DSQL does not support ALTER COLUMN ${action}. `
				+ `Cannot change default value of column "${column.name}" in table ${key}. `
				+ `Consider recreating the table with the desired schema.`;
		}

		if (diff.identity) {
			return `DSQL does not support identity columns. `
				+ `Cannot modify identity on column "${column.name}" in table ${key}.`;
		}

		if (diff.generated) {
			return `DSQL does not support altering generated columns. `
				+ `Cannot modify generated column "${column.name}" in table ${key}. `
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

export { createIndexConvertor, dropIndexConvertor, recreateIndexConvertor };
