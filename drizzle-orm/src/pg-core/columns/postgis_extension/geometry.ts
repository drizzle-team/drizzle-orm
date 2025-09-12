import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';

import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export class PgGeometryBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgGeometryBuilder';

	constructor(name: string) {
		super(name, 'array geometry', 'PgGeometry');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgGeometry(
			table,
			this.config as any,
		);
	}
}

export class PgGeometry<T extends ColumnBaseConfig<'array geometry'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgGeometry';

	getSQLType(): string {
		return 'geometry(point)';
	}

	override mapFromDriverValue(value: string | [number, number]): [number, number] {
		if (typeof value !== 'string') return value as [number, number];

		return parseEWKB(value);
	}

	override mapToDriverValue(value: [number, number]): string {
		return `point(${value[0]} ${value[1]})`;
	}
}

export class PgGeometryObjectBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'object geometry';
	data: { x: number; y: number };
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgGeometryObjectBuilder';

	constructor(name: string) {
		super(name, 'object geometry', 'PgGeometryObject');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgGeometryObject(
			table,
			this.config as any,
		);
	}
}

export class PgGeometryObject<T extends ColumnBaseConfig<'object geometry'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgGeometryObject';

	getSQLType(): string {
		return 'geometry(point)';
	}

	override mapFromDriverValue(value: string): { x: number; y: number } {
		const parsed = parseEWKB(value);
		return { x: parsed[0], y: parsed[1] };
	}

	override mapToDriverValue(value: { x: number; y: number }): string {
		return `point(${value.x} ${value.y})`;
	}
}

export interface PgGeometryConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
	type?: 'point' | (string & {});
	srid?: number;
}

export function geometry<TMode extends PgGeometryConfig['mode'] & {}>(
	config?: PgGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgGeometryObjectBuilder : PgGeometryBuilder;
export function geometry<TMode extends PgGeometryConfig['mode'] & {}>(
	name: string,
	config?: PgGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgGeometryObjectBuilder : PgGeometryBuilder;
export function geometry(a?: string | PgGeometryConfig, b?: PgGeometryConfig) {
	const { name, config } = getColumnNameAndConfig<PgGeometryConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new PgGeometryBuilder(name);
	}
	return new PgGeometryObjectBuilder(name);
}
