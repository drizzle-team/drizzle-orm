import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgPointTupleBuilder extends PgColumnBuilder<{
	dataType: 'array point';
	data: [number, number];
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'PgPointTupleBuilder';

	constructor(name: string) {
		super(name, 'array point', 'PgPointTuple');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgPointTuple(
			table,
			this.config as any,
		);
	}
}

export class PgPointTuple extends PgColumn<'array point'> {
	static override readonly [entityKind]: string = 'PgPointTuple';

	readonly mode = 'tuple';

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
	dataType: 'object point';
	data: { x: number; y: number };
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgPointObjectBuilder';

	constructor(name: string) {
		super(name, 'object point', 'PgPointObject');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgPointObject(
			table,
			this.config as any,
		);
	}
}

export class PgPointObject extends PgColumn<'object point'> {
	static override readonly [entityKind]: string = 'PgPointObject';

	readonly mode = 'xy';

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
