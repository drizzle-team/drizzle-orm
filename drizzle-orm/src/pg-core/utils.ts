import type { AnyPgTable } from '~/pg-core/table';
import { PgTable } from '~/pg-core/table';
import { Table } from '~/table';
import { ViewBaseConfig } from '~/view';
import type { Check } from './checks';
import { CheckBuilder } from './checks';
import type { ForeignKey } from './foreign-keys';
import { ForeignKeyBuilder } from './foreign-keys';
import type { Index } from './indexes';
import { IndexBuilder } from './indexes';
import type { PrimaryKey } from './primary-keys';
import { PrimaryKeyBuilder } from './primary-keys';
import { type PgMaterializedView, PgMaterializedViewConfig, type PgView, PgViewConfig } from './view';

export function getTableConfig<TTable extends AnyPgTable>(table: TTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[PgTable.Symbol.InlineForeignKeys]);
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];

	const extraConfigBuilder = table[PgTable.Symbol.ExtraConfigBuilder];

	if (typeof extraConfigBuilder !== 'undefined') {
		const extraConfig = extraConfigBuilder(table[Table.Symbol.Columns]);
		Object.values(extraConfig).forEach((builder) => {
			if (builder instanceof IndexBuilder) {
				indexes.push(builder.build(table));
			} else if (builder instanceof CheckBuilder) {
				checks.push(builder.build(table));
			} else if (builder instanceof PrimaryKeyBuilder) {
				primaryKeys.push(builder.build(table));
			} else if (builder instanceof ForeignKeyBuilder) {
				foreignKeys.push(builder.build(table));
			}
		});
	}

	return {
		columns,
		indexes,
		foreignKeys,
		checks,
		primaryKeys,
		name,
		schema,
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
