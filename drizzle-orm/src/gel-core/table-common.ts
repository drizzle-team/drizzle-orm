import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import type { GelColumn, GelExtraConfigColumn } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { GelPolicy } from './policies.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type GelTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
	| GelPolicy;

export type GelTableExtraConfig = Record<
	string,
	GelTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<GelColumn>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:GelInlineForeignKeys');
/** @internal */
export const EnableRLS = Symbol.for('drizzle:EnableRLS');

export class GelTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'GelTable';

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
		EnableRLS: EnableRLS as typeof EnableRLS,
	});

	/**@internal */
	[InlineForeignKeys]: ForeignKey[] = [];

	/** @internal */
	[EnableRLS]: boolean = false;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]: ((self: Record<string, GelColumn>) => GelTableExtraConfig) | undefined =
		undefined;

	/** @internal */
	override [Table.Symbol.ExtraConfigColumns]: Record<string, GelExtraConfigColumn> = {};
}

export type AnyGelTable<TPartial extends Partial<TableConfig> = {}> = GelTable<
	UpdateTableConfig<TableConfig, TPartial>
>;
