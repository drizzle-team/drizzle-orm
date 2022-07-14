import { BuildColumns } from 'drizzle-orm/column-builder';
import { Table } from 'drizzle-orm/table';
import { tableColumns, tableName } from 'drizzle-orm/utils';

import { AnyPgColumn, PgColumnBuilder } from './columns/common';
import { AnyConstraintBuilder, Constraint, ConstraintBuilder } from './constraints';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, Index, IndexBuilder } from './indexes';
import { tableConstraints, tableForeignKeys, tableIndexes } from './utils';

export type PgTableExtraConfig<TTableName extends string> = Record<
	string,
	| AnyIndexBuilder<TTableName>
	| ConstraintBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, string>
>;

export type ConflictConstraintKeyOnly<Key, TType> = TType extends AnyConstraintBuilder
	? Key
	: TType extends IndexBuilder<any, infer TUnique>
	? TUnique extends true
		? Key
		: never
	: never;

export type InferConflictConstraints<TConfig extends PgTableExtraConfig<string>> = {
	[Key in keyof TConfig as ConflictConstraintKeyOnly<Key, TConfig[Key]>]: true;
};

export type ConflictConstraint = true;

export class PgTable<
	TName extends string,
	TColumns extends Record<string, AnyPgColumn>,
	TConflictConstraints extends Record<string, ConflictConstraint>,
> extends Table<TName, TColumns> {
	protected override enforceCovariance!: Table<TName, TColumns>['enforceCovariance'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableName]!: TName;

	/** @internal */
	[tableColumns]!: TColumns;

	/** @internal */
	[tableIndexes]: Record<string, Index<TName>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string, ForeignKey<TName, string>> = {};

	/** @internal */
	[tableConstraints]: Record<string, Constraint<TName>> = {};
}

export type AnyPgTable<TName extends string = string> = PgTable<
	TName,
	Record<string, AnyPgColumn>,
	Record<string, ConflictConstraint>
>;

export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, PgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TTableName>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => TExtraConfig,
) {
	const rawTable = new PgTable<
		TTableName,
		BuildColumns<TTableName, TColumnsMap>,
		InferConflictConstraints<TExtraConfig>
	>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(rawTable)]),
	) as BuildColumns<TTableName, TColumnsMap>;

	const table = Object.assign(rawTable, builtColumns);

	table[tableColumns] = builtColumns;

	if (extraConfig) {
		Object.entries(extraConfig(table)).forEach(([name, builder]) => {
			if (builder instanceof IndexBuilder) {
				table[tableIndexes][name] = builder.build(table);
			} else if (builder instanceof ConstraintBuilder) {
				table[tableConstraints][name] = builder.build(table);
			} else if (builder instanceof ForeignKeyBuilder) {
				table[tableForeignKeys][name] = builder.build(table);
			}
		});
	}

	return table;
}
