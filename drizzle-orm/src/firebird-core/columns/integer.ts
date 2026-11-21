import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '../table.ts';
import { FirebirdColumn } from './common.ts';
import { FirebirdIntColumnBaseBuilder } from './int.common.ts';

export type FirebirdIntegerBuilderInitial<TName extends string> = FirebirdIntegerBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'FirebirdInteger';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class FirebirdIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'FirebirdInteger'>>
	extends FirebirdIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'FirebirdInteger');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdInteger<MakeColumnConfig<T, TTableName>> {
		return new FirebirdInteger<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class FirebirdInteger<T extends ColumnBaseConfig<'number', 'FirebirdInteger'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdInteger';

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

export function integer(): FirebirdIntegerBuilderInitial<''>;
export function integer<TName extends string>(name: TName): FirebirdIntegerBuilderInitial<TName>;
export function integer(name?: string) {
	return new FirebirdIntegerBuilder(name ?? '');
}
