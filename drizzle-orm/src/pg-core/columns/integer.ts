import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '../table.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBaseBuilder } from './int.common.ts';

export type PgIntegerBuilderInitial<TName extends string> = PgIntegerBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgInteger';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class PgIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgInteger'>>
	extends PgIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'PgIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgInteger');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInteger<MakeColumnConfig<T, TTableName>> {
		return new PgInteger<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgInteger<T extends ColumnBaseConfig<'number', 'PgInteger'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export function integer(): PgIntegerBuilderInitial<''>;
export function integer<TName extends string>(name: TName): PgIntegerBuilderInitial<TName>;
export function integer(name?: string) {
	return new PgIntegerBuilder(name ?? '');
}
