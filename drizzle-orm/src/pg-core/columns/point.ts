import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgPointTupleBuilderInitial<TName extends string> = PgPointTupleBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgPointTuple';
	data: [number, number];
	driverParam: number | string;
	enumValues: undefined;
}>;

export class PgPointTupleBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgPointTuple'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgPointTupleBuilder';

	constructor(name: string) {
		super(name, 'array', 'PgPointTuple');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgPointTuple<MakeColumnConfig<T, TTableName>> {
		return new PgPointTuple<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgPointTuple<T extends ColumnBaseConfig<'array', 'PgPointTuple'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgPointTuple';

	getSQLType(): string {
		return 'point';
	}

	override mapFromDriverValue(value: string | { x: number; y: number }): [number, number] {
		if (typeof value === 'string') {
			const [x, y] = value.slice(1, -1).split(',');
			return [Number.parseFloat(x!), Number.parseFloat(y!)];
		}
		return [value.x, value.y];
	}

	override mapToDriverValue(value: [number, number]): string {
		return `(${value[0]},${value[1]})`;
	}
}

export type PgPointObjectBuilderInitial<TName extends string> = PgPointObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgPointObject';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
}>;

export class PgPointObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgPointObject'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgPointObjectBuilder';

	constructor(name: string) {
		super(name, 'json', 'PgPointObject');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgPointObject<MakeColumnConfig<T, TTableName>> {
		return new PgPointObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgPointObject<T extends ColumnBaseConfig<'json', 'PgPointObject'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgPointObject';

	getSQLType(): string {
		return 'point';
	}

	override mapFromDriverValue(value: string | { x: number; y: number }): { x: number; y: number } {
		if (typeof value === 'string') {
			const [x, y] = value.slice(1, -1).split(',');
			return { x: Number.parseFloat(x!), y: Number.parseFloat(y!) };
		}
		return value;
	}

	override mapToDriverValue(value: { x: number; y: number }): string {
		return `(${value.x},${value.y})`;
	}
}

export interface PgPointConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
}

export function point(): PgPointTupleBuilderInitial<''>;
export function point<TMode extends PgPointConfig['mode'] & {}>(
	config?: PgPointConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgPointObjectBuilderInitial<''>
	: PgPointTupleBuilderInitial<''>;
export function point<TName extends string, TMode extends PgPointConfig['mode'] & {}>(
	name: TName,
	config?: PgPointConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgPointObjectBuilderInitial<TName>
	: PgPointTupleBuilderInitial<TName>;
export function point(a?: string | PgPointConfig, b?: PgPointConfig) {
	const { name, config } = getColumnNameAndConfig<PgPointConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new PgPointTupleBuilder(name);
	}
	return new PgPointObjectBuilder(name);
}
