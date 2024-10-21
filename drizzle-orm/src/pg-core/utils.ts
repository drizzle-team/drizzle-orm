import { is } from '~/entity.ts';
import { PgTable } from '~/pg-core/table.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { AnyPgColumn } from './columns/index.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import { PgPolicy } from './policies.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import { PgViewConfig } from './view-common.ts';
import { type PgMaterializedView, PgMaterializedViewConfig, type PgView } from './view.ts';

export function getTableConfig<TTable extends PgTable>(table: TTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[PgTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const policies: PgPolicy[] = [];
	const enableRLS: boolean = table[PgTable.Symbol.EnableRLS];

	const extraConfigBuilder = table[PgTable.Symbol.ExtraConfigBuilder];

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
			} else if (is(builder, PgPolicy)) {
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

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: PgView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[PgViewConfig],
	};
}

export function getMaterializedViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: PgMaterializedView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[PgMaterializedViewConfig],
	};
}

export type ColumnsWithTable<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
> = { [Key in keyof TColumns]: AnyPgColumn<{ tableName: TForeignTableName }> };
