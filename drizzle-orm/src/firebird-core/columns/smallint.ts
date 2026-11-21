import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { FirebirdColumn } from './common.ts';
import { FirebirdIntColumnBaseBuilder } from './int.common.ts';

export type FirebirdSmallIntBuilderInitial<TName extends string> = FirebirdSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'FirebirdSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class FirebirdSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'FirebirdSmallInt'>>
	extends FirebirdIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'FirebirdSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'FirebirdSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdSmallInt<MakeColumnConfig<T, TTableName>> {
		return new FirebirdSmallInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class FirebirdSmallInt<T extends ColumnBaseConfig<'number', 'FirebirdSmallInt'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue = (value: number | string): number => {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	};
}

export function smallint(): FirebirdSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(name: TName): FirebirdSmallIntBuilderInitial<TName>;
export function smallint(name?: string) {
	return new FirebirdSmallIntBuilder(name ?? '');
}
