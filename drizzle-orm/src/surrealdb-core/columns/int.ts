import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBIntBuilderInitial<TName extends string> = SurrealDBIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SurrealDBInt';
	data: number;
	driverParam: number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'SurrealDBInt'>>
	extends SurrealDBColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SurrealDBIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SurrealDBInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBInt<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBInt<T extends ColumnBaseConfig<'number', 'SurrealDBInt'>>
	extends SurrealDBColumn<T>
{
	static override readonly [entityKind]: string = 'SurrealDBInt';

	getSQLType(): string {
		return 'int';
	}
}

export function int(): SurrealDBIntBuilderInitial<''>;
export function int<TName extends string>(name: TName): SurrealDBIntBuilderInitial<TName>;
export function int(name?: string): any {
	return new SurrealDBIntBuilder(name ?? '');
}
