import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdDoublePrecisionBuilderInitial<TName extends string> = FirebirdDoublePrecisionBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'FirebirdDoublePrecision';
	data: number;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class FirebirdDoublePrecisionBuilder<T extends ColumnBuilderBaseConfig<'number', 'FirebirdDoublePrecision'>>
	extends FirebirdColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdDoublePrecisionBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'FirebirdDoublePrecision');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdDoublePrecision<MakeColumnConfig<T, TTableName>> {
		return new FirebirdDoublePrecision<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdDoublePrecision<T extends ColumnBaseConfig<'number', 'FirebirdDoublePrecision'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdDoublePrecision';

	getSQLType(): string {
		return 'double precision';
	}

	override mapFromDriverValue(value: string | number): number {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	}
}

export function doublePrecision(): FirebirdDoublePrecisionBuilderInitial<''>;
export function doublePrecision<TName extends string>(name: TName): FirebirdDoublePrecisionBuilderInitial<TName>;
export function doublePrecision(name?: string) {
	return new FirebirdDoublePrecisionBuilder(name ?? '');
}
