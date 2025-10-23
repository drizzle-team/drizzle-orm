import { is } from '~/entity.ts';
import { SQL } from '~/index.ts';
import { Subquery } from '~/subquery.ts';
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
import type { IndexForHint } from './query-builders/select.ts';
import { MySqlTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import type { MySqlViewBase } from './view-base.ts';
import { MySqlViewConfig } from './view-common.ts';
import type { MySqlView } from './view.ts';

export function extractUsedTable(table: MySqlTable | Subquery | MySqlViewBase | SQL): string[] {
	if (is(table, MySqlTable)) {
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
		const extraValues = Array.isArray(extraConfig) ? extraConfig.flat(1) as any[] : Object.values(extraConfig);
		for (const builder of Object.values(extraValues)) {
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

export function convertIndexToString(indexes: IndexForHint[]) {
	return indexes.map((idx) => {
		return typeof idx === 'object' ? idx.config.name : idx;
	});
}

export function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}
