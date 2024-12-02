import { CasingCache } from '~/casing.ts';
import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import type { Casing, ObjectToArray } from '~/utils.ts';
import { SingleStoreDatabase } from './db.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import type { PrimaryKey } from './primary-keys.ts';
import { PrimaryKeyBuilder } from './primary-keys.ts';
import { SingleStoreTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
/* import { SingleStoreViewConfig } from './view-common.ts';
import type { SingleStoreView } from './view.ts'; */

export interface GetTableConfigOptions {
	casing: Casing;
}

export interface FullTableConfig<TTable extends SingleStoreTable> {
	columns: ObjectToArray<SingleStoreTable['_']['columns']>;
	indexes: Index[];
	primaryKeys: PrimaryKey[];
	uniqueConstraints: UniqueConstraint[];
	name: TTable['_']['name'];
	schema: TTable['_']['schema'];
	baseName: string;
}

export function getTableConfig<T extends SingleStoreTable>(table: T): FullTableConfig<T>;
export function getTableConfig<T extends SingleStoreTable>(
	table: T,
	db: SingleStoreDatabase<any, any>,
): FullTableConfig<T>;
export function getTableConfig<T extends SingleStoreTable>(
	table: T,
	options: GetTableConfigOptions,
): FullTableConfig<T>;
export function getTableConfig(
	table: SingleStoreTable,
	options?: GetTableConfigOptions | SingleStoreDatabase<any, any>,
): FullTableConfig<SingleStoreTable> {
	const casing = is(options, SingleStoreDatabase)
		? options.dialect.casing
		: (options as GetTableConfigOptions)?.casing
		? new CasingCache((options as GetTableConfigOptions)?.casing)
		: undefined;

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
		for (const builder of extraValues) {
			if (is(builder, IndexBuilder)) {
				indexes.push(builder.build(table));
			} else if (is(builder, UniqueConstraintBuilder)) {
				uniqueConstraints.push(builder.build(table, casing));
			} else if (is(builder, PrimaryKeyBuilder)) {
				primaryKeys.push(builder.build(table, casing));
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
