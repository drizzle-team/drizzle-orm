import { CasingCache } from '~/casing.ts';
import { is } from '~/entity.ts';
import { PgTable } from '~/pg-core/table.ts';
import { Table } from '~/table.ts';
import type { Casing, ObjectToArray } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { AnyPgColumn } from './columns/index.ts';
import { PgDatabase } from './db.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import { PgPolicy } from './policies.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import { PgViewConfig } from './view-common.ts';
import { type PgMaterializedView, PgMaterializedViewConfig, type PgView } from './view.ts';

export interface GetTableConfigOptions {
	casing: Casing;
}

export interface FullTableConfig<TTable extends PgTable> {
	columns: ObjectToArray<PgTable['_']['columns']>;
	indexes: Index[];
	checks: Check[];
	primaryKeys: PrimaryKey[];
	uniqueConstraints: UniqueConstraint[];
	foreignKeys: ForeignKey[];
	policies: PgPolicy[];
	name: TTable['_']['name'];
	schema: TTable['_']['schema'];
	baseName: string;
	enableRLS: boolean;
}

export function getTableConfig<T extends PgTable>(table: T): FullTableConfig<T>;
export function getTableConfig<T extends PgTable>(table: T, db: PgDatabase<any>): FullTableConfig<T>;
export function getTableConfig<T extends PgTable>(table: T, options: GetTableConfigOptions): FullTableConfig<T>;
export function getTableConfig(
	table: PgTable,
	options?: GetTableConfigOptions | PgDatabase<any>,
): FullTableConfig<PgTable> {
	const casing = is(options, PgDatabase)
		? options.dialect.casing
		: (options as GetTableConfigOptions)?.casing
		? new CasingCache((options as GetTableConfigOptions)?.casing)
		: undefined;

	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[PgTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const baseName = table[Table.Symbol.BaseName];
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
				uniqueConstraints.push(builder.build(table, casing));
			} else if (is(builder, PrimaryKeyBuilder)) {
				primaryKeys.push(builder.build(table, casing));
			} else if (is(builder, ForeignKeyBuilder)) {
				foreignKeys.push(builder.build(table, casing));
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
		baseName,
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
