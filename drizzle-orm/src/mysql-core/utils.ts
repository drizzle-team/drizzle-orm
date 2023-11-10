import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { Check } from './checks.ts';
import { CheckBuilder } from './checks.ts';
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

export function getTableConfig(table: MySqlTable) {
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
		for (const builder of Object.values(extraConfig)) {
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
