import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import type { PrimaryKey } from './primary-keys.ts';
import { PrimaryKeyBuilder } from './primary-keys.ts';
import { SingleStoreTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
/* import { SingleStoreViewConfig } from './view-common.ts';
import type { SingleStoreView } from './view.ts'; */

export function extractUsedTable(table: SingleStoreTable | Subquery | SQL): string[] {
	if (is(table, SingleStoreTable)) {
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

export function getTableConfig(table: SingleStoreTable) {
	const columns = Object.values(table[SingleStoreTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const baseName = table[Table.Symbol.BaseName];

	const extraConfigBuilder = table[SingleStoreTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[SingleStoreTable.Symbol.Columns]);
		const extraValues = Array.isArray(extraConfig) ? extraConfig.flat(1) as any[] : Object.values(extraConfig);
		for (const builder of Object.values(extraValues)) {
			if (is(builder, IndexBuilder)) {
				indexes.push(builder.build(table));
			} else if (is(builder, UniqueConstraintBuilder)) {
				uniqueConstraints.push(builder.build(table));
			} else if (is(builder, PrimaryKeyBuilder)) {
				primaryKeys.push(builder.build(table));
			}
		}
	}

	return {
		columns,
		indexes,
		primaryKeys,
		uniqueConstraints,
		name,
		schema,
		baseName,
	};
}

/* export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: SingleStoreView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[SingleStoreViewConfig],
	};
} */
