import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBDatetimeBuilderInitial<TName extends string> = SurrealDBDatetimeBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'SurrealDBDatetime';
	data: Date;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBDatetimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'SurrealDBDatetime'>>
	extends SurrealDBColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SurrealDBDatetimeBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'SurrealDBDatetime');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBDatetime<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBDatetime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBDatetime<T extends ColumnBaseConfig<'date', 'SurrealDBDatetime'>>
	extends SurrealDBColumn<T>
{
	static override readonly [entityKind]: string = 'SurrealDBDatetime';

	getSQLType(): string {
		return 'datetime';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString();
	}
}

export function datetime(): SurrealDBDatetimeBuilderInitial<''>;
export function datetime<TName extends string>(name: TName): SurrealDBDatetimeBuilderInitial<TName>;
export function datetime(name?: string): any {
	return new SurrealDBDatetimeBuilder(name ?? '');
}
