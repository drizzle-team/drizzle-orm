import { CasingCache } from '~/casing.ts';
import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import { type Casing, type ObjectToArray } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { Check } from './checks.ts';
import { CheckBuilder } from './checks.ts';
import { BaseSQLiteDatabase } from './db.ts';
import type { ForeignKey } from './foreign-keys.ts';
import { ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import type { PrimaryKey } from './primary-keys.ts';
import { PrimaryKeyBuilder } from './primary-keys.ts';
import { SQLiteTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import type { SQLiteView } from './view.ts';

export interface GetTableConfigOptions {
	casing: Casing;
}

export interface FullTableConfig<TTable extends SQLiteTable> {
	columns: ObjectToArray<SQLiteTable['_']['columns']>;
	indexes: Index[];
	checks: Check[];
	primaryKeys: PrimaryKey[];
	uniqueConstraints: UniqueConstraint[];
	foreignKeys: ForeignKey[];
	name: TTable['_']['name'];
	baseName: string;
}

export function getTableConfig<T extends SQLiteTable>(table: T): FullTableConfig<T>;
export function getTableConfig<T extends SQLiteTable>(table: T, db: BaseSQLiteDatabase<any, any>): FullTableConfig<T>;
export function getTableConfig<T extends SQLiteTable>(table: T, options: GetTableConfigOptions): FullTableConfig<T>;
export function getTableConfig(
	table: SQLiteTable,
	options?: GetTableConfigOptions | BaseSQLiteDatabase<any, any>,
): FullTableConfig<SQLiteTable> {
	const casing = is(options, BaseSQLiteDatabase)
		? options.dialect.casing
		: (options as GetTableConfigOptions)?.casing
		? new CasingCache((options as GetTableConfigOptions)?.casing)
		: undefined;

	const columns = Object.values(table[SQLiteTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const uniqueConstraints: UniqueConstraint[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[SQLiteTable.Symbol.InlineForeignKeys]);
	const name = table[Table.Symbol.Name];
	const baseName = table[Table.Symbol.BaseName];

	const extraConfigBuilder = table[SQLiteTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[SQLiteTable.Symbol.Columns]);
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
		baseName,
	};
}

export type OnConflict = 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: SQLiteView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		// ...view[SQLiteViewConfig],
	};
}
