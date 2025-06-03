import { CockroachDbTable } from '~/cockroachdb-core/table.ts';
import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { AnyCockroachDbColumn } from './columns/index.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import { CockroachDbPolicy } from './policies.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import { type CockroachDbMaterializedView, CockroachDbMaterializedViewConfig, type CockroachDbView } from './view.ts';

export function getTableConfig<TTable extends CockroachDbTable>(table: TTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[CockroachDbTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const policies: CockroachDbPolicy[] = [];
	const enableRLS: boolean = table[CockroachDbTable.Symbol.EnableRLS];

	const extraConfigBuilder = table[CockroachDbTable.Symbol.ExtraConfigBuilder];

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
			} else if (is(builder, CockroachDbPolicy)) {
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
>(view: CockroachDbView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
	};
}

export function getMaterializedViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: CockroachDbMaterializedView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[CockroachDbMaterializedViewConfig],
	};
}

export type ColumnsWithTable<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyCockroachDbColumn<{ tableName: TTableName }>[],
> = { [Key in keyof TColumns]: AnyCockroachDbColumn<{ tableName: TForeignTableName }> };
