import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { ClickHouseTableEngine } from './engines.ts';
import { type Index, IndexBuilder, type Projection, ProjectionBuilder } from './indexes.ts';
import { ClickHouseTable } from './table.ts';

export function extractUsedTable(table: ClickHouseTable | Subquery | SQL): string[] {
	if (is(table, ClickHouseTable)) {
		return [`${table[Table.Symbol.BaseName]}`];
	}
	if (is(table, Subquery)) {
		return table._.usedTables ?? [];
	}
	if (is(table, SQL)) {
		return table.usedTables ?? [];
	}
	return [];
}

/**
 * Reads back everything a table declared: its columns, its engine and the indexes and projections
 * from the extra-config array.
 *
 * This is what drizzle-kit reads to generate DDL, and is also the supported way for application code
 * to introspect a schema.
 */
export function getTableConfig(table: ClickHouseTable) {
	const columns = Object.values(table[ClickHouseTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const projections: Projection[] = [];
	let engine: ClickHouseTableEngine | undefined;
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const baseName = table[Table.Symbol.BaseName];

	const extraConfigBuilder = table[ClickHouseTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[ClickHouseTable.Symbol.Columns]);
		for (const builder of (Array.isArray(extraConfig) ? extraConfig.flat(1) : Object.values(extraConfig)) as any[]) {
			if (is(builder, ClickHouseTableEngine)) {
				if (engine !== undefined) {
					throw new Error(`Table "${name}" declares more than one engine`);
				}
				engine = builder;
			} else if (is(builder, IndexBuilder)) {
				indexes.push(builder.build(table));
			} else if (is(builder, ProjectionBuilder)) {
				projections.push(builder.build(table));
			}
		}
	}

	return {
		columns,
		engine,
		indexes,
		projections,
		name,
		schema,
		baseName,
	};
}
