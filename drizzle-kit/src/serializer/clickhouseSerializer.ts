import { is, SQL } from 'drizzle-orm';
import type { AnyClickHouseTable, ClickHouseColumn } from 'drizzle-orm/clickhouse-core';
import { ClickHouseDialect, getTableConfig } from 'drizzle-orm/clickhouse-core';
import type { CasingType } from 'src/cli/validations/common';
import { withStyle } from '../cli/validations/outputs';
import { type IntrospectStage, type IntrospectStatus } from '../cli/views';
import type { DB } from '../utils';
import type {
	ClickHouseKitInternals,
	ClickHouseSchemaInternal,
	Column,
	Engine,
	Index,
	Projection,
	Table,
} from './clickhouseSchema';

/**
 * Renders a Drizzle `SQL` fragment the way it must appear in DDL.
 *
 * `'indexes'` is what makes column references come out as bare `` `name` `` rather than the
 * `` `table`.`name` `` form used in queries — the latter is a syntax error inside `CREATE TABLE`.
 */
function ddl(dialect: ClickHouseDialect, value: SQL): string {
	return dialect.sqlToQuery(value, 'indexes').sql;
}

function serializeEngine(dialect: ClickHouseDialect, engine: ReturnType<typeof getTableConfig>['engine']): Engine {
	const args = engine!.args.map((arg) => ddl(dialect, is(arg, SQL) ? arg : (arg as any).getSQL()));

	const key = (expressions: unknown[] | undefined) => {
		if (expressions === undefined) return undefined;
		const rendered = expressions.map((it) => ddl(dialect, is(it, SQL) ? it : (it as any).getSQL()));
		// A key of several expressions has to be a tuple; `ORDER BY a, b` is a syntax error in DDL.
		return rendered.length === 1 ? rendered[0]! : `(${rendered.join(', ')})`;
	};

	const settings: Record<string, string> = {};
	for (const [name, value] of Object.entries(engine!.settings ?? {})) {
		settings[name] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
	}

	return {
		name: engine!.name,
		args,
		// MergeTree always has a sorting key; `tuple()` is how ClickHouse spells "none", and recording it
		// explicitly keeps a snapshot taken from a schema comparable with one read back from the server.
		orderBy: key(engine!.orderBy) ?? (engine!.isMergeTree ? 'tuple()' : undefined),
		partitionBy: key(engine!.partitionBy),
		primaryKey: key(engine!.primaryKey),
		sampleBy: key(engine!.sampleBy),
		ttl: engine!.ttl ? ddl(dialect, engine!.ttl) : undefined,
		settings,
	};
}

function serializeColumn(dialect: ClickHouseDialect, column: ClickHouseColumn): Column {
	const generated = column.generated;
	const computedKeyword = column.computedKeyword;

	const expression = generated
		? ddl(dialect, typeof generated.as === 'function' ? generated.as() : (generated.as as SQL))
		: undefined;

	return {
		name: column.name,
		type: column.getSQLType(),
		default: column.default === undefined
			? undefined
			: is(column.default, SQL)
			? ddl(dialect, column.default)
			: column.default,
		materialized: computedKeyword === 'MATERIALIZED' ? expression : undefined,
		alias: computedKeyword === 'ALIAS' ? expression : undefined,
		ephemeral: column.isEphemeral ? true : undefined,
		codec: column.codec?.length
			? column.codec.map((c) => (typeof c === 'string' ? c : ddl(dialect, c))).join(', ')
			: undefined,
		ttl: column.ttl ? ddl(dialect, column.ttl) : undefined,
		comment: column.comment,
	};
}

export const generateClickHouseSnapshot = (
	tables: AnyClickHouseTable[],
	casing: CasingType | undefined,
): ClickHouseSchemaInternal => {
	const dialect = new ClickHouseDialect({ casing });
	const result: Record<string, Table> = {};
	const internal: ClickHouseKitInternals = { tables: {} };

	for (const table of tables) {
		const config = getTableConfig(table as any);
		const { name: tableName, schema, columns, engine, indexes, projections } = config;

		if (!engine) {
			console.log(
				withStyle.errorWarning(
					`Table "${tableName}" does not declare an engine. Add one to the table's extra config, for example \`(t) => [mergeTree({ orderBy: t.id })]\`.`,
				),
			);
			process.exit(1);
		}

		const columnsObject: Record<string, Column> = {};
		for (const column of columns) {
			columnsObject[column.name] = serializeColumn(dialect, column);
		}

		const indexesObject: Record<string, Index> = {};
		for (const index of indexes) {
			const { name, expressions, type, typeArgs, granularity } = index.config;
			if (indexesObject[name] !== undefined) {
				console.log(
					withStyle.errorWarning(
						`We've found duplicated index name across "${tableName}" table. Please rename your index in either the table or the schema.`,
					),
				);
				process.exit(1);
			}
			indexesObject[name] = {
				name,
				expression: expressions.map((it) => ddl(dialect, is(it, SQL) ? it : (it as any).getSQL())).join(', '),
				type: typeArgs.length > 0 ? `${type}(${typeArgs.join(', ')})` : type,
				granularity: String(granularity ?? 1),
			};
		}

		const projectionsObject: Record<string, Projection> = {};
		for (const value of projections) {
			projectionsObject[value.config.name] = {
				name: value.config.name,
				query: ddl(dialect, value.config.query),
			};
		}

		const tableKey = `${schema ?? ''}.${tableName}`;
		result[tableKey] = {
			name: tableName,
			schema: schema ?? '',
			columns: columnsObject,
			indexes: indexesObject,
			projections: projectionsObject,
			engine: serializeEngine(dialect, engine),
		};
	}

	return {
		version: '1',
		dialect: 'clickhouse',
		tables: result,
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};

/** Splits `MergeTree(a, b)` into its name and argument list. */
function parseEngineExpression(engineFull: string, engineName: string): { name: string; args: string[] } {
	const trimmed = engineFull.trim();
	if (!trimmed.startsWith(engineName) || trimmed.length === engineName.length) {
		return { name: engineName, args: [] };
	}

	const inner = trimmed.slice(engineName.length).trim();
	if (!inner.startsWith('(') || !inner.endsWith(')')) {
		return { name: engineName, args: [] };
	}

	const body = inner.slice(1, -1).trim();
	if (body.length === 0) return { name: engineName, args: [] };

	// Split on top-level commas only: engine arguments can themselves be calls, e.g. `toYYYYMM(d)`.
	const args: string[] = [];
	let depth = 0;
	let quote: string | undefined;
	let current = '';
	for (let i = 0; i < body.length; i++) {
		const char = body[i]!;
		if (quote) {
			current += char;
			if (char === '\\') {
				current += body[++i] ?? '';
			} else if (char === quote) {
				quote = undefined;
			}
			continue;
		}
		if (char === `'` || char === '"' || char === '`') {
			quote = char;
			current += char;
			continue;
		}
		if (char === '(') depth++;
		if (char === ')') depth--;
		if (char === ',' && depth === 0) {
			args.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	if (current.trim().length > 0) args.push(current.trim());

	return { name: engineName, args };
}

/**
 * Reads a snapshot back out of a live server.
 *
 * `system.tables` carries the engine and its clauses already rendered, and `system.columns` carries
 * the column types in the same textual form Drizzle emits, so introspection is mostly a matter of
 * reshaping rather than parsing.
 */
export const fromDatabase = async (
	db: DB,
	inputSchema: string,
	tablesFilter: (table: string) => boolean = () => true,
	progressCallback?: (stage: IntrospectStage, count: number, status: IntrospectStatus) => void,
): Promise<ClickHouseSchemaInternal> => {
	const result: Record<string, Table> = {};
	const internal: ClickHouseKitInternals = { tables: {} };

	const dbTables = await db.query<{
		name: string;
		database: string;
		engine: string;
		engine_full: string;
		sorting_key: string;
		partition_key: string;
		primary_key: string;
		sampling_key: string;
	}>(
		`select name, database, engine, engine_full, sorting_key, partition_key, primary_key, sampling_key
		 from system.tables
		 where database = '${inputSchema}' and engine not in ('View', 'MaterializedView', 'Dictionary')
		 order by name`,
	);

	const filtered = dbTables.filter((it) => tablesFilter(it.name));
	progressCallback?.('tables', filtered.length, 'done');

	let columnsCount = 0;
	let indexesCount = 0;

	for (const dbTable of filtered) {
		const columnsObject: Record<string, Column> = {};

		const dbColumns = await db.query<{
			name: string;
			type: string;
			default_kind: string;
			default_expression: string;
			comment: string;
			compression_codec: string;
		}>(
			// `system.columns` exposes no column-level TTL, which is why `push` does not compare it.
			`select name, type, default_kind, default_expression, comment, compression_codec
			 from system.columns
			 where database = '${inputSchema}' and table = '${dbTable.name}'
			 order by position`,
		);

		for (const dbColumn of dbColumns) {
			columnsCount += 1;
			const defaultKind = dbColumn.default_kind;
			const defaultExpression = dbColumn.default_expression || undefined;

			columnsObject[dbColumn.name] = {
				name: dbColumn.name,
				type: dbColumn.type,
				default: defaultKind === 'DEFAULT' ? defaultExpression : undefined,
				materialized: defaultKind === 'MATERIALIZED' ? defaultExpression : undefined,
				alias: defaultKind === 'ALIAS' ? defaultExpression : undefined,
				ephemeral: defaultKind === 'EPHEMERAL' ? true : undefined,
				// `compression_codec` comes back as the whole `CODEC(...)` wrapper; the snapshot stores
				// only the arguments, which is what the DDL builder re-wraps.
				codec: dbColumn.compression_codec
					? dbColumn.compression_codec.replace(/^CODEC\((.*)\)$/s, '$1')
					: undefined,
				comment: dbColumn.comment || undefined,
			};
		}

		const indexesObject: Record<string, Index> = {};
		// `type` carries only the bare index type; `type_full` keeps its arguments, e.g. `bloom_filter(0.02)`.
		const dbIndexes = await db.query<{ name: string; expr: string; type_full: string; granularity: string }>(
			`select name, expr, type_full, toString(granularity) as granularity
			 from system.data_skipping_indices
			 where database = '${inputSchema}' and table = '${dbTable.name}'`,
		);
		for (const dbIndex of dbIndexes) {
			indexesCount += 1;
			indexesObject[dbIndex.name] = {
				name: dbIndex.name,
				expression: dbIndex.expr,
				type: dbIndex.type_full,
				granularity: dbIndex.granularity,
			};
		}

		// Projections are only visible through `system.projection_parts`, which lists nothing until the
		// table has parts, so an empty table reports none. `push` therefore does not compare them.
		const projectionsObject: Record<string, Projection> = {};

		const { name: engineName, args } = parseEngineExpression(dbTable.engine_full, dbTable.engine);

		// The database is implied by the connection, so tables are keyed the same way an unqualified
		// `clickhouseTable(...)` serializes — otherwise every table would look both created and deleted.
		const tableKey = `.${dbTable.name}`;
		result[tableKey] = {
			name: dbTable.name,
			schema: '',
			columns: columnsObject,
			indexes: indexesObject,
			projections: projectionsObject,
			engine: {
				name: engineName,
				args,
				orderBy: dbTable.sorting_key || undefined,
				partitionBy: dbTable.partition_key || undefined,
				// ClickHouse reports the primary key even when it was defaulted from the sorting key;
				// treating them as equal avoids a spurious diff against a schema that never declared one.
				primaryKey: dbTable.primary_key && dbTable.primary_key !== dbTable.sorting_key
					? dbTable.primary_key
					: undefined,
				sampleBy: dbTable.sampling_key || undefined,
				settings: {},
			},
		};
	}

	progressCallback?.('columns', columnsCount, 'done');
	progressCallback?.('indexes', indexesCount, 'done');

	return {
		version: '1',
		dialect: 'clickhouse',
		tables: result,
		_meta: {
			tables: {},
			columns: {},
		},
		internal,
	};
};

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};
