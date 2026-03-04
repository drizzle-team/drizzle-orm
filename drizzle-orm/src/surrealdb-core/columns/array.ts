import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBArrayBuilderInitial<TName extends string> = SurrealDBArrayBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'SurrealDBArray';
	data: unknown[];
	driverParam: unknown[];
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBArrayBuilder<T extends ColumnBuilderBaseConfig<'array', 'SurrealDBArray'>>
	extends SurrealDBColumnBuilder<T, { itemType: string }>
{
	static override readonly [entityKind]: string = 'SurrealDBArrayBuilder';

	constructor(name: T['name'], itemType: string) {
		super(name, 'array', 'SurrealDBArray');
		this.config.itemType = itemType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBArray<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBArray<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBArray<T extends ColumnBaseConfig<'array', 'SurrealDBArray'>>
	extends SurrealDBColumn<T, { itemType: string }>
{
	static override readonly [entityKind]: string = 'SurrealDBArray';

	readonly itemType: string = this.config.itemType;

	getSQLType(): string {
		return `array<${this.itemType}>`;
	}
}

export function array(): SurrealDBArrayBuilderInitial<''>;
export function array<TName extends string>(name: TName, itemType?: string): SurrealDBArrayBuilderInitial<TName>;
export function array(nameOrItemType?: string, itemType?: string): any {
	if (itemType !== undefined) {
		return new SurrealDBArrayBuilder(nameOrItemType ?? '', itemType);
	}
	return new SurrealDBArrayBuilder('', nameOrItemType ?? 'any');
}
