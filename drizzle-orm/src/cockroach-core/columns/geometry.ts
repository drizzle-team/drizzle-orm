import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';
import { parseEWKB } from './utils.ts';

export class CockroachGeometryBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachGeometryBuilder';

	constructor(name: string) {
		super(name, 'array geometry', 'CockroachGeometry');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachGeometry(
			table,
			this.config,
		);
	}
}

export class CockroachGeometry<T extends ColumnBaseConfig<'array geometry'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachGeometry';

	getSQLType(): string {
		return 'geometry(point)';
	}

	override mapFromDriverValue(value: string): [number, number] {
		return parseEWKB(value);
	}

	override mapToDriverValue(value: [number, number]): string {
		return `point(${value[0]} ${value[1]})`;
	}
}

export class CockroachGeometryObjectBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'object geometry';
	data: { x: number; y: number };
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachGeometryObjectBuilder';

	constructor(name: string) {
		super(name, 'object geometry', 'CockroachGeometryObject');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachGeometryObject(
			table,
			this.config,
		);
	}
}

export class CockroachGeometryObject<T extends ColumnBaseConfig<'object geometry'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachGeometryObject';

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

export interface CockroachGeometryConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
	type?: 'point' | (string & {});
	srid?: number;
}

export function geometry<TMode extends CockroachGeometryConfig['mode'] & {}>(
	config?: CockroachGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachGeometryObjectBuilder
	: CockroachGeometryBuilder;
export function geometry<TMode extends CockroachGeometryConfig['mode'] & {}>(
	name: string,
	config?: CockroachGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachGeometryObjectBuilder
	: CockroachGeometryBuilder;
export function geometry(a?: string | CockroachGeometryConfig, b?: CockroachGeometryConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachGeometryConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new CockroachGeometryBuilder(name);
	}
	return new CockroachGeometryObjectBuilder(name);
}
