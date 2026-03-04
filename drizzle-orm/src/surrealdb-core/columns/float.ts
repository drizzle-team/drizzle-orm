import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBFloatBuilderInitial<TName extends string> = SurrealDBFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SurrealDBFloat';
	data: number;
	driverParam: number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'SurrealDBFloat'>>
	extends SurrealDBColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SurrealDBFloatBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SurrealDBFloat');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBFloat<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBFloat<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBFloat<T extends ColumnBaseConfig<'number', 'SurrealDBFloat'>>
	extends SurrealDBColumn<T>
{
	static override readonly [entityKind]: string = 'SurrealDBFloat';

	getSQLType(): string {
		return 'float';
	}
}

export function float(): SurrealDBFloatBuilderInitial<''>;
export function float<TName extends string>(name: TName): SurrealDBFloatBuilderInitial<TName>;
export function float(name?: string): any {
	return new SurrealDBFloatBuilder(name ?? '');
}
