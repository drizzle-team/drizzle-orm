import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn } from './common.ts';
import { CockroachIntColumnBaseBuilder } from './int.common.ts';

export type CockroachSmallIntBuilderInitial<TName extends string> = CockroachSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class CockroachSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachSmallInt'>>
	extends CockroachIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachSmallInt<MakeColumnConfig<T, TTableName>> {
		return new CockroachSmallInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachSmallInt<T extends ColumnBaseConfig<'number', 'CockroachSmallInt'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachSmallInt';

	getSQLType(): string {
		return 'int2';
	}

	override mapFromDriverValue = (value: number | string): number => {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	};
}

export function smallint(): CockroachSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(name: TName): CockroachSmallIntBuilderInitial<TName>;
export function smallint(name?: string) {
	return new CockroachSmallIntBuilder(name ?? '');
}
export function int2(): CockroachSmallIntBuilderInitial<''>;
export function int2<TName extends string>(name: TName): CockroachSmallIntBuilderInitial<TName>;
export function int2(name?: string) {
	return new CockroachSmallIntBuilder(name ?? '');
}
