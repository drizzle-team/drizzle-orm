import { is } from '~/entity.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { AnyDSQLColumn } from './columns/common.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import { type Index, IndexBuilder } from './indexes.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { DSQLTable } from './table.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import { DSQLViewConfig } from './view-common.ts';
import type { DSQLView } from './view.ts';

export function getTableConfig(table: DSQLTable): {
	columns: AnyDSQLColumn[];
	indexes: Index[];
	checks: Check[];
	primaryKeys: PrimaryKey[];
	foreignKeys: ForeignKey[];
	uniqueConstraints: UniqueConstraint[];
	name: string;
	schema: string | undefined;
} {
	const columns = Object.values(table[Table.Symbol.Columns]) as AnyDSQLColumn[];
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[DSQLTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];

	const extraConfigBuilder = table[Table.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[Table.Symbol.ExtraConfigColumns]);
		const extraValues = Array.isArray(extraConfig) ? extraConfig.flat(1) : Object.values(extraConfig);
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
			}
		}
	}

	return {
		columns,
		indexes,
		checks,
		primaryKeys,
		foreignKeys,
		uniqueConstraints,
		name,
		schema,
	};
}

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: DSQLView<TName, TExisting>): {
	name: TName;
	schema: string | undefined;
	isExisting: TExisting;
	query: unknown;
	selectedFields: Record<string, unknown>;
} {
	return {
		...view[ViewBaseConfig],
		...view[DSQLViewConfig],
	} as any;
}
