import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyCockroachDbTable } from '../table.ts';
import { CockroachDbColumn } from './common.ts';
import { CockroachDbIntColumnBaseBuilder } from './int.common.ts';

export type CockroachDbIntegerBuilderInitial<TName extends string> = CockroachDbIntegerBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDbInteger';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class CockroachDbIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachDbInteger'>>
	extends CockroachDbIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachDbInteger');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbInteger<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbInteger<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbInteger<T extends ColumnBaseConfig<'number', 'CockroachDbInteger'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbInteger';

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

export function int4(): CockroachDbIntegerBuilderInitial<''>;
export function int4<TName extends string>(name: TName): CockroachDbIntegerBuilderInitial<TName>;
export function int4(name?: string) {
	return new CockroachDbIntegerBuilder(name ?? '');
}
