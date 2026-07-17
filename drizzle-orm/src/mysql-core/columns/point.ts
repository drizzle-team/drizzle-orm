import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';

import { sql } from '~/sql/index.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlPointTupleBuilderInitial<TName extends string> = MySqlPointTupleBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'MySqlPointTuple';
	data: [number, number];
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlPointTupleBuilder<
	T extends ColumnBuilderBaseConfig<'array', 'MySqlPointTuple'>,
> extends MySqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'MySqlPointTupleBuilder';

	constructor(name: string) {
		super(name, 'array', 'MySqlPointTuple');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlPointTuple<MakeColumnConfig<T, TTableName>> {
		return new MySqlPointTuple<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlPointTuple<
	T extends ColumnBaseConfig<'array', 'MySqlPointTuple'>,
> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlPointTuple';

	getSQLType(): string {
		return 'point';
	}

	override mapFromDriverValue(value: string | { x: number; y: number }): [number, number] {
		if (typeof value === 'string') {
			const [x, y] = value.slice(1, -1).split(' ');
			return [Number.parseFloat(x!), Number.parseFloat(y!)];
		}
		return [value.x, value.y];
	}

	override mapToDriverValue(value: [number, number]) {
		return sql`POINT(${value[0]},${value[1]})`;
	}
}

export type MySqlPointObjectBuilderInitial<TName extends string> = MySqlPointObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'MySqlPointObject';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlPointObjectBuilder<
	T extends ColumnBuilderBaseConfig<'json', 'MySqlPointObject'>,
> extends MySqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'MySqlPointObjectBuilder';

	constructor(name: string) {
		super(name, 'json', 'MySqlPointObject');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlPointObject<MakeColumnConfig<T, TTableName>> {
		return new MySqlPointObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlPointObject<
	T extends ColumnBaseConfig<'json', 'MySqlPointObject'>,
> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlPointObject';

	getSQLType(): string {
		return 'point';
	}

	override mapFromDriverValue(value: string | { x: number; y: number }): { x: number; y: number } {
		if (typeof value === 'string') {
			const [x, y] = value.slice(1, -1).split(' ');
			return { x: Number.parseFloat(x!), y: Number.parseFloat(y!) };
		}
		return value;
	}

	override mapToDriverValue(value: { x: number; y: number }) {
		return sql`POINT(${value.x},${value.y})`;
	}
}

export interface MySqlPointConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
}

export function point(): MySqlPointTupleBuilderInitial<''>;
export function point<TMode extends MySqlPointConfig['mode'] & {}>(
	config?: MySqlPointConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? MySqlPointObjectBuilderInitial<''>
	: MySqlPointTupleBuilderInitial<''>;
export function point<TName extends string, TMode extends MySqlPointConfig['mode'] & {}>(
	name: TName,
	config?: MySqlPointConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? MySqlPointObjectBuilderInitial<TName>
	: MySqlPointTupleBuilderInitial<TName>;
export function point(a?: string | MySqlPointConfig, b?: MySqlPointConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlPointConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new MySqlPointTupleBuilder(name);
	}
	return new MySqlPointObjectBuilder(name);
}
