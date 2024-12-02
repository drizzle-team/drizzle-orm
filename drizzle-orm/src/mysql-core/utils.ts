import { CasingCache } from '~/casing.ts';
import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import type { Casing, ObjectToArray } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { Check } from './checks.ts';
import { CheckBuilder } from './checks.ts';
import { MySqlDatabase } from './db.ts';
import type { ForeignKey } from './foreign-keys.ts';
import { ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import type { PrimaryKey } from './primary-keys.ts';
import { PrimaryKeyBuilder } from './primary-keys.ts';
import { MySqlTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import { MySqlViewConfig } from './view-common.ts';
import type { MySqlView } from './view.ts';

export interface GetTableConfigOptions {
	casing: Casing;
}

export interface FullTableConfig<TTable extends MySqlTable> {
	columns: ObjectToArray<MySqlTable['_']['columns']>;
	indexes: Index[];
	checks: Check[];
	primaryKeys: PrimaryKey[];
	uniqueConstraints: UniqueConstraint[];
	foreignKeys: ForeignKey[];
	name: TTable['_']['name'];
	schema: TTable['_']['schema'];
	baseName: string;
}

export function getTableConfig<T extends MySqlTable>(table: T): FullTableConfig<T>;
export function getTableConfig<T extends MySqlTable>(table: T, db: MySqlDatabase<any, any>): FullTableConfig<T>;
export function getTableConfig<T extends MySqlTable>(table: T, options: GetTableConfigOptions): FullTableConfig<T>;
export function getTableConfig(
	table: MySqlTable,
	options?: GetTableConfigOptions | MySqlDatabase<any, any>,
): FullTableConfig<MySqlTable> {
	const casing = is(options, MySqlDatabase)
		? options.dialect.casing
		: (options as GetTableConfigOptions)?.casing
		? new CasingCache((options as GetTableConfigOptions)?.casing)
		: undefined;

	const columns = Object.values(table[MySqlTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const uniqueConstraints: UniqueConstraint[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[MySqlTable.Symbol.InlineForeignKeys]);
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const baseName = table[Table.Symbol.BaseName];

	const extraConfigBuilder = table[MySqlTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[MySqlTable.Symbol.Columns]);
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
		baseName,
	};
}

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: MySqlView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[MySqlViewConfig],
	};
}
