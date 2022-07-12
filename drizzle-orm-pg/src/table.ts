import { BuildColumns } from 'drizzle-orm/column-builder';
import { Table, table } from 'drizzle-orm/table';

import { AnyPgColumn, PgColumnBuilder } from './columns/common';
import { AnyConstraintBuilder, Constraint, ConstraintBuilder } from './constraints';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, Index, IndexBuilder } from './indexes';
import {
	tableConflictConstraints,
	tableConstraints,
	tableForeignKeys,
	tableIndexes,
} from './utils';

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
	/** @internal */
	[tableIndexes]: Record<string, Index<TName>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string, ForeignKey<TName, string>> = {};

	/** @internal */
	[tableConstraints]: Record<string, Constraint<TName>> = {};

	// TODO: make private after testing is done
	[tableConflictConstraints]!: TConflictConstraints;
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
	const t = table(name, columns) as PgTable<
		TTableName,
		BuildColumns<TTableName, TColumnsMap>,
		InferConflictConstraints<TExtraConfig>
	> &
		BuildColumns<TTableName, TColumnsMap>;

	if (extraConfig) {
		Object.entries(extraConfig(t)).forEach(([name, builder]) => {
			if (builder instanceof IndexBuilder) {
				t[tableIndexes][name] = builder.build(t);
			} else if (builder instanceof ConstraintBuilder) {
				t[tableConstraints][name] = builder.build(t);
			} else if (builder instanceof ForeignKeyBuilder) {
				t[tableForeignKeys][name] = builder.build(t);
			}
		});
	}

	return t;
}
