import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyCockroachTable } from '../table.ts';
import { CockroachColumn } from './common.ts';
import { CockroachIntColumnBaseBuilder } from './int.common.ts';

export type CockroachIntegerBuilderInitial<TName extends string> = CockroachIntegerBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachInteger';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class CockroachIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachInteger'>>
	extends CockroachIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachInteger');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachInteger<MakeColumnConfig<T, TTableName>> {
		return new CockroachInteger<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachInteger<T extends ColumnBaseConfig<'number', 'CockroachInteger'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachInteger';

	getSQLType(): string {
		return 'int4';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export function int4(): CockroachIntegerBuilderInitial<''>;
export function int4<TName extends string>(name: TName): CockroachIntegerBuilderInitial<TName>;
export function int4(name?: string) {
	return new CockroachIntegerBuilder(name ?? '');
}
