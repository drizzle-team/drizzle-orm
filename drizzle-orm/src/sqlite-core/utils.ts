import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
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
import { SQLiteTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import type { SQLiteViewBase } from './view-base.ts';
import type { SQLiteView } from './view.ts';

export function getTableConfig<TTable extends SQLiteTable>(table: TTable) {
	const columns = Object.values(table[SQLiteTable.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const uniqueConstraints: UniqueConstraint[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[SQLiteTable.Symbol.InlineForeignKeys]);
	const name = table[Table.Symbol.Name];

	const extraConfigBuilder = table[SQLiteTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[SQLiteTable.Symbol.Columns]);
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
	};
}

export function extractUsedTable(table: SQLiteTable | Subquery | SQLiteViewBase | SQL): string[] {
	if (is(table, SQLiteTable)) {
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
