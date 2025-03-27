import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgLineBuilderInitial<TName extends string> = PgLineBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgLine';
	data: [number, number, number];
	driverParam: number | string;
	enumValues: undefined;
}>;

export class PgLineBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgLine'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgLineBuilder';

	constructor(name: T['name']) {
		super(name, 'array', 'PgLine');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgLineTuple<MakeColumnConfig<T, TTableName>> {
		return new PgLineTuple<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgLineTuple<T extends ColumnBaseConfig<'array', 'PgLine'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgLine';

	getSQLType(): string {
		return 'line';
	}

	override mapFromDriverValue(value: string): [number, number, number] {
		const [a, b, c] = value.slice(1, -1).split(',');
		return [Number.parseFloat(a!), Number.parseFloat(b!), Number.parseFloat(c!)];
	}

	override mapToDriverValue(value: [number, number, number]): string {
		return `{${value[0]},${value[1]},${value[2]}}`;
	}
}

export type PgLineABCBuilderInitial<TName extends string> = PgLineABCBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgLineABC';
	data: { a: number; b: number; c: number };
	driverParam: string;
	enumValues: undefined;
}>;

export class PgLineABCBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgLineABC'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgLineABCBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgLineABC');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgLineABC<MakeColumnConfig<T, TTableName>> {
		return new PgLineABC<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgLineABC<T extends ColumnBaseConfig<'json', 'PgLineABC'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgLineABC';

	getSQLType(): string {
		return 'line';
	}

	override mapFromDriverValue(value: string): { a: number; b: number; c: number } {
		const [a, b, c] = value.slice(1, -1).split(',');
		return { a: Number.parseFloat(a!), b: Number.parseFloat(b!), c: Number.parseFloat(c!) };
	}

	override mapToDriverValue(value: { a: number; b: number; c: number }): string {
		return `{${value.a},${value.b},${value.c}}`;
	}
}

export interface PgLineTypeConfig<T extends 'tuple' | 'abc' = 'tuple' | 'abc'> {
	mode?: T;
}

export function line(): PgLineBuilderInitial<''>;
export function line<TMode extends PgLineTypeConfig['mode'] & {}>(
	config?: PgLineTypeConfig<TMode>,
): Equal<TMode, 'abc'> extends true ? PgLineABCBuilderInitial<''>
	: PgLineBuilderInitial<''>;
export function line<TName extends string, TMode extends PgLineTypeConfig['mode'] & {}>(
	name: TName,
	config?: PgLineTypeConfig<TMode>,
): Equal<TMode, 'abc'> extends true ? PgLineABCBuilderInitial<TName>
	: PgLineBuilderInitial<TName>;
export function line(a?: string | PgLineTypeConfig, b?: PgLineTypeConfig) {
	const { name, config } = getColumnNameAndConfig<PgLineTypeConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new PgLineBuilder(name);
	}
	return new PgLineABCBuilder(name);
}
