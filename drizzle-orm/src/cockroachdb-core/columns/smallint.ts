import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachDbColumn } from './common.ts';
import { CockroachDbIntColumnBaseBuilder } from './int.common.ts';

export type CockroachDbSmallIntBuilderInitial<TName extends string> = CockroachDbSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDbSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class CockroachDbSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachDbSmallInt'>>
	extends CockroachDbIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachDbSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbSmallInt<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbSmallInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbSmallInt<T extends ColumnBaseConfig<'number', 'CockroachDbSmallInt'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbSmallInt';

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

export function smallint(): CockroachDbSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(name: TName): CockroachDbSmallIntBuilderInitial<TName>;
export function smallint(name?: string) {
	return new CockroachDbSmallIntBuilder(name ?? '');
}
export function int2(): CockroachDbSmallIntBuilderInitial<''>;
export function int2<TName extends string>(name: TName): CockroachDbSmallIntBuilderInitial<TName>;
export function int2(name?: string) {
	return new CockroachDbSmallIntBuilder(name ?? '');
}
