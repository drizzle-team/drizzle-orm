import { fromJson } from './clickhouseSqlGenerator';
import type { JsonClickHouseStatement } from './clickhouseStatements';
import { diffColumns, diffSchemasOrTables } from './jsonDiffer';
import type {
	ClickHouseSchema,
	ClickHouseSchemaSquashed,
	Column,
	Engine,
	Index,
	Projection,
	Table,
} from './serializer/clickhouseSchema';
import { ClickHouseSquasher } from './serializer/clickhouseSchema';
import { copy } from './utils';

type SquashedTable = ClickHouseSchemaSquashed['tables'][string];

export interface ResolverInput<T extends { name: string }> {
	created: T[];
	deleted: T[];
}

export interface ResolverOutputWithMoved<T extends { name: string }> {
	created: T[];
	moved: { name: string; schemaFrom: string; schemaTo: string }[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

export interface ColumnsResolverInput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	deleted: T[];
}

export interface ColumnsResolverOutput<T extends { name: string }> {
	tableName: string;
	schema: string;
	created: T[];
	renamed: { from: T; to: T }[];
	deleted: T[];
}

const tableKey = (schema: string, name: string) => `${schema ?? ''}.${name}`;

/**
 * Column definitions are compared as a whole; any difference becomes one `MODIFY COLUMN`.
 *
 * `push` diffs against a snapshot read out of `system.columns`, which does not expose column-level
 * TTL — comparing it there would report a change on every run, so it is skipped.
 */
function columnsEqual(left: Column, right: Column, action?: 'push'): boolean {
	return left.type === right.type
		&& String(left.default) === String(right.default)
		&& left.materialized === right.materialized
		&& left.alias === right.alias
		&& Boolean(left.ephemeral) === Boolean(right.ephemeral)
		&& left.codec === right.codec
		&& (action === 'push' || left.ttl === right.ttl)
		&& left.comment === right.comment;
}

/**
 * Puts an engine expression into a comparable form.
 *
 * The server reports keys unquoted and without the surrounding tuple (`ts, id`), while Drizzle renders
 * them quoted and parenthesised (``(`ts`, `id`)``). Without this, every `push` would decide the
 * sorting key had changed and try to rebuild the table.
 */
function normalizeExpression(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	let normalized = value.replace(/`/g, '').replace(/\s+/g, ' ').trim();
	if (normalized.startsWith('(') && normalized.endsWith(')')) {
		normalized = normalized.slice(1, -1).trim();
	}
	return normalized;
}

function indexesEqual(left: Index, right: Index): boolean {
	// The server reports index expressions unquoted, so they need the same normalization as engine keys.
	return normalizeExpression(left.expression) === normalizeExpression(right.expression)
		&& normalizeExpression(left.type) === normalizeExpression(right.type)
		&& (left.granularity ?? '1') === (right.granularity ?? '1');
}

/**
 * Decides how an engine change can be applied.
 *
 * ClickHouse fixes the engine and its keys at creation time. The exceptions are `TTL`, `SETTINGS`,
 * and *extending* the sorting key — anything else means the table has to be rebuilt.
 */
function diffEngines(
	prev: Engine,
	cur: Engine,
	action?: 'push',
): { recreate?: string; modifyOrderBy?: string; modifyTtl?: boolean; modifySettings?: boolean } {
	if (prev.name !== cur.name) {
		return { recreate: `engine changed from ${prev.name} to ${cur.name}` };
	}

	if (JSON.stringify(prev.args) !== JSON.stringify(cur.args)) {
		return { recreate: `engine arguments changed` };
	}

	if (normalizeExpression(prev.partitionBy) !== normalizeExpression(cur.partitionBy)) {
		return { recreate: `PARTITION BY changed` };
	}

	if (normalizeExpression(prev.sampleBy) !== normalizeExpression(cur.sampleBy)) {
		return { recreate: `SAMPLE BY changed` };
	}

	if (normalizeExpression(prev.primaryKey) !== normalizeExpression(cur.primaryKey)) {
		return { recreate: `PRIMARY KEY changed` };
	}

	const result: { modifyOrderBy?: string; modifyTtl?: boolean; modifySettings?: boolean; recreate?: string } = {};

	if (normalizeExpression(prev.orderBy) !== normalizeExpression(cur.orderBy)) {
		const prevKey = normalizeExpression(prev.orderBy) ?? '';
		const curKey = normalizeExpression(cur.orderBy) ?? '';
		// Only appending to the sorting key is allowed in place; reordering or removing is not.
		if (prevKey.length > 0 && curKey.startsWith(prevKey)) {
			result.modifyOrderBy = cur.orderBy!;
		} else {
			return { recreate: `ORDER BY changed` };
		}
	}

	if (prev.ttl !== cur.ttl) {
		result.modifyTtl = true;
	}

	// Engine settings are not exposed by `system.tables`, so `push` cannot compare them.
	if (action !== 'push' && JSON.stringify(prev.settings ?? {}) !== JSON.stringify(cur.settings ?? {})) {
		result.modifySettings = true;
	}

	return result;
}

/**
 * Diffs two ClickHouse snapshots into migration statements.
 *
 * The table and column rename resolution reuses the same generic machinery as the other dialects, so
 * interactive renames behave identically; everything downstream of that is ClickHouse-specific.
 */
export const applyClickHouseSnapshotsDiff = async (
	json1: ClickHouseSchemaSquashed,
	json2: ClickHouseSchemaSquashed,
	tablesResolver: (input: ResolverInput<SquashedTable>) => Promise<ResolverOutputWithMoved<SquashedTable>>,
	columnsResolver: (input: ColumnsResolverInput<Column>) => Promise<ColumnsResolverOutput<Column>>,
	_prevFull: ClickHouseSchema,
	curFull: ClickHouseSchema,
	action?: 'push' | undefined,
): Promise<{
	statements: JsonClickHouseStatement[];
	sqlStatements: string[];
	_meta: { schemas: {}; tables: {}; columns: {} } | undefined;
}> => {
	const tablesDiff = diffSchemasOrTables(json1.tables, json2.tables);

	const {
		created: createdTables,
		deleted: deletedTables,
		renamed: renamedTables,
	} = await tablesResolver({
		created: tablesDiff.added,
		deleted: tablesDiff.deleted,
	});

	// Re-key the previous snapshot under the new names so that the column diff below compares the
	// right pairs of tables rather than reporting a drop plus an add.
	const renamesDict = new Map<string, string>();
	for (const rename of renamedTables) {
		renamesDict.set(tableKey(rename.from.schema, rename.from.name), rename.to.name);
	}

	const tablesPatchedSnap1 = copy(json1);
	tablesPatchedSnap1.tables = Object.fromEntries(
		Object.entries(tablesPatchedSnap1.tables).map(([key, value]) => {
			const newName = renamesDict.get(tableKey(value.schema, value.name));
			if (newName === undefined) return [key, value];
			value.name = newName;
			return [tableKey(value.schema, newName), value];
		}),
	);

	const columnsDiff = diffColumns(tablesPatchedSnap1.tables, json2.tables);

	const columnRenames: { table: string; schema: string; renames: { from: Column; to: Column }[] }[] = [];
	const columnCreates: { table: string; schema: string; columns: Column[] }[] = [];
	const columnDeletes: { table: string; schema: string; columns: Column[] }[] = [];

	for (const entry of Object.values(columnsDiff) as any[]) {
		const { renamed, created, deleted } = await columnsResolver({
			tableName: entry.name,
			schema: entry.schema,
			deleted: entry.columns.deleted,
			created: entry.columns.added,
		});

		if (created.length > 0) columnCreates.push({ table: entry.name, schema: entry.schema, columns: created });
		if (deleted.length > 0) columnDeletes.push({ table: entry.name, schema: entry.schema, columns: deleted });
		if (renamed.length > 0) columnRenames.push({ table: entry.name, schema: entry.schema, renames: renamed });
	}

	const statements: JsonClickHouseStatement[] = [];

	const createdKeys = new Set(createdTables.map((it) => tableKey(it.schema, it.name)));
	const deletedKeys = new Set(deletedTables.map((it) => tableKey(it.schema, it.name)));

	for (const table of createdTables) {
		const full = curFull.tables[tableKey(table.schema, table.name)];
		if (full) statements.push({ type: 'ch_create_table', table: full });
	}

	for (const table of deletedTables) {
		statements.push({ type: 'ch_drop_table', tableName: table.name, schema: table.schema });
	}

	for (const rename of renamedTables) {
		statements.push({
			type: 'ch_rename_table',
			fromSchema: rename.from.schema,
			toSchema: rename.to.schema,
			tableNameFrom: rename.from.name,
			tableNameTo: rename.to.name,
		});
	}

	for (const entry of columnRenames) {
		for (const rename of entry.renames) {
			statements.push({
				type: 'ch_rename_column',
				tableName: entry.table,
				schema: entry.schema,
				oldColumnName: rename.from.name,
				newColumnName: rename.to.name,
			});
		}
	}

	for (const entry of columnCreates) {
		for (const column of entry.columns) {
			statements.push({ type: 'ch_add_column', tableName: entry.table, schema: entry.schema, column });
		}
	}

	for (const entry of columnDeletes) {
		for (const column of entry.columns) {
			statements.push({
				type: 'ch_drop_column',
				tableName: entry.table,
				schema: entry.schema,
				columnName: column.name,
			});
		}
	}

	// Everything below concerns tables present in both snapshots: altered columns, index and
	// projection changes, and engine changes.
	const columnRenamesByTable = new Map(
		columnRenames.map((it) => [tableKey(it.schema, it.table), it.renames]),
	);

	for (const [key, curTable] of Object.entries(json2.tables)) {
		if (createdKeys.has(key)) continue;

		// Find the previous table under whichever name it had.
		const prevTable = tablesPatchedSnap1.tables[key];
		if (!prevTable || deletedKeys.has(tableKey(prevTable.schema, prevTable.name))) continue;

		const renames = columnRenamesByTable.get(key) ?? [];
		const renamedFrom = new Map(renames.map((it) => [it.to.name, it.from.name]));

		for (const [columnName, curColumn] of Object.entries(curTable.columns)) {
			const previousName = renamedFrom.get(columnName) ?? columnName;
			const prevColumn = prevTable.columns[previousName];
			if (!prevColumn) continue; // freshly added, already handled above

			if (!columnsEqual(prevColumn, curColumn, action)) {
				statements.push({
					type: 'ch_alter_column',
					tableName: curTable.name,
					schema: curTable.schema,
					column: curColumn,
				});
			}
		}

		const prevIndexes = new Map(
			Object.entries(prevTable.indexes).map(([name, value]) => [name, ClickHouseSquasher.unsquashIdx(value)]),
		);
		const curIndexes = new Map(
			Object.entries(curTable.indexes).map(([name, value]) => [name, ClickHouseSquasher.unsquashIdx(value)]),
		);

		for (const [name, index] of curIndexes) {
			const previous = prevIndexes.get(name);
			if (previous === undefined) {
				statements.push({ type: 'ch_add_index', tableName: curTable.name, schema: curTable.schema, index });
			} else if (!indexesEqual(previous, index)) {
				// Indexes cannot be altered in place; drop and re-add.
				statements.push({
					type: 'ch_drop_index',
					tableName: curTable.name,
					schema: curTable.schema,
					indexName: name,
				});
				statements.push({ type: 'ch_add_index', tableName: curTable.name, schema: curTable.schema, index });
			}
		}

		for (const name of prevIndexes.keys()) {
			if (!curIndexes.has(name)) {
				statements.push({
					type: 'ch_drop_index',
					tableName: curTable.name,
					schema: curTable.schema,
					indexName: name,
				});
			}
		}

		// `system.projection_parts` reports nothing for a table without parts, so `push` cannot see
		// existing projections and would re-add them on every run.
		const comparingProjections = action !== 'push';

		const prevProjections = new Map(
			Object.entries(prevTable.projections).map((
				[name, value],
			) => [name, ClickHouseSquasher.unsquashProjection(value)]),
		);
		const curProjections = new Map(
			Object.entries(curTable.projections).map((
				[name, value],
			) => [name, ClickHouseSquasher.unsquashProjection(value)]),
		);

		for (const [name, projection] of comparingProjections ? curProjections : new Map()) {
			const previous = prevProjections.get(name);
			if (previous === undefined) {
				statements.push({
					type: 'ch_add_projection',
					tableName: curTable.name,
					schema: curTable.schema,
					projection,
				});
			} else if (previous.query !== projection.query) {
				statements.push({
					type: 'ch_drop_projection',
					tableName: curTable.name,
					schema: curTable.schema,
					projectionName: name,
				});
				statements.push({
					type: 'ch_add_projection',
					tableName: curTable.name,
					schema: curTable.schema,
					projection,
				});
			}
		}

		for (const name of comparingProjections ? prevProjections.keys() : []) {
			if (!curProjections.has(name)) {
				statements.push({
					type: 'ch_drop_projection',
					tableName: curTable.name,
					schema: curTable.schema,
					projectionName: name,
				});
			}
		}

		const prevEngine = ClickHouseSquasher.unsquashEngine(prevTable.engine);
		const curEngine = ClickHouseSquasher.unsquashEngine(curTable.engine);
		const engineDiff = diffEngines(prevEngine, curEngine, action);

		if (engineDiff.recreate) {
			const full = curFull.tables[key];
			if (full) {
				statements.push({ type: 'ch_recreate_table', table: full, reason: engineDiff.recreate });
			}
			continue;
		}

		if (engineDiff.modifyOrderBy !== undefined) {
			statements.push({
				type: 'ch_modify_order_by',
				tableName: curTable.name,
				schema: curTable.schema,
				orderBy: engineDiff.modifyOrderBy,
			});
		}

		if (engineDiff.modifyTtl) {
			statements.push({
				type: 'ch_modify_ttl',
				tableName: curTable.name,
				schema: curTable.schema,
				ttl: curEngine.ttl,
			});
		}

		if (engineDiff.modifySettings && Object.keys(curEngine.settings ?? {}).length > 0) {
			statements.push({
				type: 'ch_modify_settings',
				tableName: curTable.name,
				schema: curTable.schema,
				settings: curEngine.settings,
			});
		}
	}

	return {
		statements,
		sqlStatements: fromJson(statements),
		_meta: { schemas: {}, tables: {}, columns: {} },
	};
};

export type { Column, Engine, Index, Projection, Table };
