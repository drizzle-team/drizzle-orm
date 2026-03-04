import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBBoolBuilderInitial<TName extends string> = SurrealDBBoolBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'SurrealDBBool';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBBoolBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'SurrealDBBool'>>
	extends SurrealDBColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SurrealDBBoolBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'SurrealDBBool');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBBool<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBBool<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBBool<T extends ColumnBaseConfig<'boolean', 'SurrealDBBool'>>
	extends SurrealDBColumn<T>
{
	static override readonly [entityKind]: string = 'SurrealDBBool';

	getSQLType(): string {
		return 'bool';
	}
}

export function bool(): SurrealDBBoolBuilderInitial<''>;
export function bool<TName extends string>(name: TName): SurrealDBBoolBuilderInitial<TName>;
export function bool(name?: string): any {
	return new SurrealDBBoolBuilder(name ?? '');
}
