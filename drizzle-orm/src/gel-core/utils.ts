import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { AnyGelColumn } from './columns/index.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import { GelPolicy } from './policies.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { GelTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import type { GelViewBase } from './view-base.ts';
import { GelViewConfig } from './view-common.ts';
import { type GelMaterializedView, GelMaterializedViewConfig, type GelView } from './view.ts';

export function getTableConfig<TTable extends GelTable>(table: TTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[GelTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const policies: GelPolicy[] = [];
	const enableRLS: boolean = table[GelTable.Symbol.EnableRLS];

	const extraConfigBuilder = table[GelTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[Table.Symbol.ExtraConfigColumns]);
		const extraValues = Array.isArray(extraConfig) ? extraConfig.flat(1) as any[] : Object.values(extraConfig);
		for (const builder of extraValues) {
			if (is(builder, IndexBuilder)) {
				indexes.push(builder.build(table));
			} else if (is(builder, CheckBuilder)) {
				checks.push(builder.build(table));
			} else if (is(builder, UniqueConstraintBuilder)) {
				uniqueConstraints.push(builder.build(table));
			} else if (is(builder, PrimaryKeyBuilder)) {
				primaryKeys.push(builder.build(table));
			} else if (is(builder, ForeignKeyBuilder)) {
				foreignKeys.push(builder.build(table));
			} else if (is(builder, GelPolicy)) {
				policies.push(builder);
			}
		}
	}

	return {
		columns,
		indexes,
		foreignKeys,
		checks,
		primaryKeys,
		uniqueConstraints,
		name,
		schema,
		policies,
		enableRLS,
	};
}

export function extractUsedTable(table: GelTable | Subquery | GelViewBase | SQL): string[] {
	if (is(table, GelTable)) {
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

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: GelView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[GelViewConfig],
	};
}

export function getMaterializedViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: GelMaterializedView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[GelMaterializedViewConfig],
	};
}

export type ColumnsWithTable<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyGelColumn<{ tableName: TTableName }>[],
> = { [Key in keyof TColumns]: AnyGelColumn<{ tableName: TForeignTableName }> };
