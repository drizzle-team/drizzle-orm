import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';

import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgPointTupleBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'array';
	data: [number, number];
	driverParam: number | string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgPointTupleBuilder';

	constructor(name: string) {
		super(name, 'array', 'PgPointTuple');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgPointTuple(
			table,
			this.config as any,
		);
	}
}

export class PgPointTuple<T extends ColumnBaseConfig<'array'>> extends PgColumn<T> {
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

export class PgPointObjectBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'json';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgPointObjectBuilder';

	constructor(name: string) {
		super(name, 'json', 'PgPointObject');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgPointObject(
			table,
			this.config as any,
		);
	}
}

export class PgPointObject<T extends ColumnBaseConfig<'json'>> extends PgColumn<T> {
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

export function point<TMode extends PgPointConfig['mode'] & {}>(
	config?: PgPointConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgPointObjectBuilder
	: PgPointTupleBuilder;
export function point<TMode extends PgPointConfig['mode'] & {}>(
	name: string,
	config?: PgPointConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgPointObjectBuilder
	: PgPointTupleBuilder;
export function point(a?: string | PgPointConfig, b?: PgPointConfig) {
	const { name, config } = getColumnNameAndConfig<PgPointConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new PgPointTupleBuilder(name);
	}
	return new PgPointObjectBuilder(name);
}
