import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgLineBuilder extends PgColumnBuilder<{
	dataType: 'array line';
	data: [number, number, number];
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'PgLineBuilder';

	constructor(name: string) {
		super(name, 'array line', 'PgLine');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgLineTuple(
			table,
			this.config as any,
		);
	}
}

export class PgLineTuple extends PgColumn<'array line'> {
	static override readonly [entityKind]: string = 'PgLine';

	readonly mode = 'tuple';

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

export class PgLineABCBuilder extends PgColumnBuilder<{
	dataType: 'object line';
	data: { a: number; b: number; c: number };
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgLineABCBuilder';

	constructor(name: string) {
		super(name, 'object line', 'PgLineABC');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgLineABC(
			table,
			this.config as any,
		);
	}
}

export class PgLineABC extends PgColumn<'object line'> {
	static override readonly [entityKind]: string = 'PgLineABC';

	readonly mode = 'abc';

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

export function line<TMode extends PgLineTypeConfig['mode'] & {}>(
	config?: PgLineTypeConfig<TMode>,
): Equal<TMode, 'abc'> extends true ? PgLineABCBuilder
	: PgLineBuilder;
export function line<TMode extends PgLineTypeConfig['mode'] & {}>(
	name: string,
	config?: PgLineTypeConfig<TMode>,
): Equal<TMode, 'abc'> extends true ? PgLineABCBuilder
	: PgLineBuilder;
export function line(a?: string | PgLineTypeConfig, b?: PgLineTypeConfig) {
	const { name, config } = getColumnNameAndConfig<PgLineTypeConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new PgLineBuilder(name);
	}
	return new PgLineABCBuilder(name);
}
