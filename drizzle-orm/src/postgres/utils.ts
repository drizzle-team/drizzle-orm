import type { PgType, Pool, PoolQuery } from '#postgres';
import { isBrand } from '#postgres/brand';
import type { BatchItem } from '~/batch.ts';
import { is } from '~/entity.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgBasePreparedQuery, PgBoundQuery } from '~/pg-core/session.ts';
import { PgTable } from '~/pg-core/table.ts';
import { chunkKindOf, chunkKinds, fillPlaceholders, Param, Placeholder } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import type { PostgresMultiPrepared } from './session.ts';

// The statements of `batch`, `pipeline`, `parallel` and the bulk writes, built the same way for the async and the
// Effect driver. They load no runtime of either, so importing one driver does not load the other

const bulkTypes: Record<string, PgType> = {
	smallint: 'int2',
	smallserial: 'int2',
	int: 'int4',
	serial: 'int4',
	bigint: 'int8',
	bigserial: 'int8',
	numeric: 'numeric',
	float4: 'float4',
	float8: 'float8',
	bool: 'bool',
	text: 'text',
	varchar: 'varchar',
	char: 'bpchar',
	bytea: 'bytea',
	uuid: 'uuid',
	date: 'date',
	time: 'time',
	timestamp: 'timestamp',
	timestamptz: 'timestamptz',
	interval: 'interval',
	json: 'json',
	jsonb: 'jsonb',
};

/** The placeholder values a batch item carries: only a bound prepared query has any. */
function boundValues(item: unknown): Record<string, unknown> | undefined {
	return is(item, PgBoundQuery) ? item.placeholderValues : undefined;
}

/**
 * The items of `batch`, `pipeline` or `parallel` as the pool's queries: the async and the Effect driver build them
 * here, the same way. A prepared item runs under it's statement name, and a builder is prepared unnamed. Each query
 * is passed to `logQuery`, as a query run on it's own is logged.
 *
 * @internal
 */
export function buildPoolQueries(
	client: unknown,
	method: 'batch' | 'pipeline' | 'parallel',
	queries: readonly unknown[],
	logQuery: (sql: string, params: unknown[]) => void,
): { pool: Pool; prepared: PostgresMultiPrepared[]; built: PoolQuery[] } {
	// `instanceof Pool` would load the bundled client for a pool from the standalone package.
	if (!isBrand<Pool>(client, 'Pool')) throw new Error(`\`${method}\` method is only supported on connection pools!`);
	const pool = client;

	const prepared: PostgresMultiPrepared[] = new Array(queries.length);
	const built: PoolQuery[] = new Array(queries.length);
	for (let i = 0; i < queries.length; ++i) {
		const item = queries[i]!;
		// A prepared query is used as is, so it's statement name reaches the driver; a builder is prepared unnamed.
		const preparedQuery = (is(item, PgBoundQuery)
			? item.prepared
			: is(item, PgBasePreparedQuery)
			? item
			: (item as BatchItem<'pg'>)._prepare()) as PostgresMultiPrepared;
		const builtQuery = preparedQuery.getQuery();
		const params = batchParams(builtQuery.params, boundValues(item));
		logQuery(builtQuery.sql, params);
		prepared[i] = preparedQuery;
		built[i] = preparedQuery.mode === 'arrays'
			? pool.query(builtQuery.sql, params, {
				name: preparedQuery.name,
				mode: 'array',
				shape: preparedQuery.shape,
			})
			: pool.query(builtQuery.sql, params, {
				name: preparedQuery.name,
				mode: 'object',
				shape: preparedQuery.shape,
			});
	}

	return { pool, prepared, built };
}

/**
 * The params of a batch item's query as the driver got them, for it's error: placeholders filled from the item's
 * bound values
 *
 * @internal
 */
export function batchItemParams(prepared: PostgresMultiPrepared, item: unknown): unknown[] {
	return batchParams(prepared.getQuery().params, boundValues(item));
}

/**
 * A batch item's params as the driver gets them. Placeholders are filled from the item's bound values, and an
 * item that has placeholders but no values throws, the same as `.execute()` without them. Params without any
 * placeholder are passed through as they are, with no copy.
 */
function batchParams(params: unknown[], values: Record<string, unknown> | undefined): unknown[] {
	for (let i = 0; i < params.length; ++i) {
		const p = params[i];
		if (is(p, Placeholder) || (is(p, Param) && is(p.value, Placeholder))) return fillPlaceholders(params, values ?? {});
	}
	return params;
}

function bulkType(col: PgColumn): PgType | undefined {
	if (col.dimensions) return;
	const codec = col.codec;
	if (codec === undefined) return;
	const sep = codec.indexOf(':');
	return bulkTypes[sep === -1 ? codec : codec.slice(0, sep)];
}

function isColumnList(by: PgColumn | readonly PgColumn[]): by is readonly PgColumn[] {
	return Array.isArray(by);
}

function bulkTableName(method: string, table: PgTable): string {
	const name = table[PgTable.Symbol.OriginalName];
	const schema = table[PgTable.Symbol.Schema];
	if (name.includes('.') || schema?.includes('.')) {
		throw new Error(`\`${method}\`: table and schema names containing "." are not supported`);
	}

	return schema ? `${schema}.${name}` : name;
}

function bulkParam(method: string, value: unknown, col: PgColumn, codecs: PgDialect['codecs']): unknown {
	if (value === null) return null;
	if (chunkKindOf(value) !== chunkKinds.other) {
		throw new Error(
			`\`${method}\`: column "${col.name}" received an SQL expression, bulk operations only accept values`,
		);
	}

	let mapped: unknown = col.mapToDriverValue.isNoop ? value : col.mapToDriverValue(value);
	if (chunkKindOf(mapped) !== chunkKinds.other) {
		throw new Error(
			`\`${method}\`: column "${col.name}" maps it's value to an SQL expression, bulk operations only accept values`,
		);
	}

	const normalize = codecs.codecsOf(col).normalizeParam;
	if (normalize) mapped = normalize(mapped, col.dimensions);

	return mapped;
}

/**
 * The driver's `bulkInsert` arguments for the given rows.
 *
 * They are for the driver's multi-row `values` insert (`defaults: true`), which every `bulkInsert` uses. It is the
 * only one that can leave a single cell to it's database default, written as `DEFAULT` in the statement: an
 * `unnest` over arrays sends every column for every row, so a missing cell would arrive as NULL and override the
 * default. With one kind of statement for every call, the rows are not inspected to choose between two paths that
 * behave differently, and column types that have no array form (arrays, enums, custom types) need no fallback.
 *
 * @internal
 */
export function buildBulkInsert(dialect: PgDialect, table: PgTable, rows: readonly Record<string, unknown>[]) {
	const codecs = dialect.codecs;
	const tableColumns = table[Table.Symbol.Columns];
	const entries = Object.entries(tableColumns).filter(([, col]) => !col.shouldDisableInsert());
	const width = entries.length;
	const rowCount = rows.length;

	for (let c = 0; c < width; ++c) {
		const col = entries[c]![1];
		if (codecs.codecsOf(col).castParam) {
			throw new Error(
				`\`bulkInsert\`: column "${col.name}" requires a parameter cast, which bulk operations can't apply`,
			);
		}
	}

	const cells: unknown[][] = new Array(rowCount);
	const definedCount: number[] = new Array(width).fill(0);
	for (let r = 0; r < rowCount; ++r) {
		const source = rows[r]!;
		const row: unknown[] = new Array(width);
		for (let c = 0; c < width; ++c) {
			const [key, col] = entries[c]!;
			let value = source[key];
			if (value === undefined) {
				if (col.defaultFn !== undefined) value = col.defaultFn();
				else if (!col.default && col.onUpdateFn !== undefined) value = col.onUpdateFn();
			}
			if (value === undefined) continue;

			++definedCount[c]!;
			row[c] = bulkParam('bulkInsert', value, col, codecs);
		}
		cells[r] = row;
	}

	// Columns left to the database default in every row are dropped
	const included: number[] = [];
	for (let c = 0; c < width; ++c) {
		if (definedCount[c]! !== 0) included.push(c);
	}
	// Every cell is left to the database default - `values (default, ...)` on every column
	if (included.length === 0) {
		for (let c = 0; c < width; ++c) included.push(c);
	}

	// The driver's `values` statement infers parameter types from the target columns: the types here only
	// complete the column record it's API takes
	const columns: Record<string, PgType> = {};
	for (const c of included) {
		const col = entries[c]![1];
		columns[col.name] = bulkType(col) ?? 'text';
	}

	// Nothing was dropped: the cells are the driver's rows as they are
	if (included.length === width) return { table: bulkTableName('bulkInsert', table), columns, rows: cells };

	const driverRows: unknown[][] = new Array(rowCount);
	for (let r = 0; r < rowCount; ++r) {
		const row: unknown[] = new Array(included.length);
		const source = cells[r]!;
		for (let i = 0; i < included.length; ++i) row[i] = source[included[i]!];
		driverRows[r] = row;
	}

	return { table: bulkTableName('bulkInsert', table), columns, rows: driverRows };
}

/** @internal */
export function buildBulkUpdate(
	dialect: PgDialect,
	table: PgTable,
	rows: readonly Record<string, unknown>[],
	by: PgColumn | readonly PgColumn[],
) {
	const codecs = dialect.codecs;
	const tableColumns = table[Table.Symbol.Columns];
	const tableEntries = Object.entries(tableColumns);
	const rowCount = rows.length;

	const byColumns = isColumnList(by) ? by : [by];
	if (byColumns.length === 0) throw new Error('`bulkUpdate`: `by` must contain at least one column');
	const keyEntries: [string, PgColumn][] = new Array(byColumns.length);
	for (let i = 0; i < byColumns.length; ++i) {
		const byColumn = byColumns[i]!;
		const entry = tableEntries.find(([, col]) => col === byColumn)
			?? tableEntries.find(([, col]) => col.name === byColumn.name);
		if (!entry) throw new Error(`\`bulkUpdate\`: \`by\` column "${byColumn.name}" doesn't belong to the table`);
		keyEntries[i] = entry;
	}
	const keyNames = keyEntries.map(([, col]) => col.name);

	const setEntries = tableEntries.filter(([key, col]) => {
		if (keyNames.includes(col.name)) return false;
		if (col.onUpdateFn !== undefined) return true;
		for (let r = 0; r < rowCount; ++r) if (rows[r]![key] !== undefined) return true;
		return false;
	});
	if (setEntries.length === 0) throw new Error('No values to set');

	const entries = [...keyEntries, ...setEntries];
	const width = entries.length;
	const columns: Record<string, PgType> = {};
	for (let c = 0; c < width; ++c) {
		const col = entries[c]![1];
		const type = bulkType(col);
		if (type === undefined) {
			throw new Error(
				`\`bulkUpdate\`: column "${col.name}" of type "${col.getSQLType()}${
					'[]'.repeat(col.dimensions ?? 0)
				}" can't be sent as an \`unnest\` array`,
			);
		}
		if (codecs.codecsOf(col).castParam) {
			throw new Error(
				`\`bulkUpdate\`: column "${col.name}" requires a parameter cast, which bulk operations can't apply`,
			);
		}
		columns[col.name] = type;
	}

	const driverRows: unknown[][] = new Array(rowCount);
	for (let r = 0; r < rowCount; ++r) {
		const source = rows[r]!;
		const row: unknown[] = new Array(width);
		for (let c = 0; c < width; ++c) {
			const [key, col] = entries[c]!;
			let value = source[key];
			if (value === undefined) {
				if (c < keyEntries.length) {
					throw new Error(`\`bulkUpdate\`: row ${r} is missing key column "${col.name}"`);
				}
				if (col.onUpdateFn === undefined) {
					throw new Error(
						`\`bulkUpdate\`: row ${r} doesn't set column "${col.name}", which other rows set - every row must set the same columns`,
					);
				}
				value = col.onUpdateFn();
			}

			row[c] = bulkParam('bulkUpdate', value, col, codecs);
		}
		driverRows[r] = row;
	}

	return { table: bulkTableName('bulkUpdate', table), columns, rows: driverRows, by: keyNames };
}
