import type { CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';
import { parseEWKB } from './utils.ts';

export class CockroachGeometryBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}, { srid: number | undefined }> {
	static override readonly [entityKind]: string = 'CockroachGeometryBuilder';

	constructor(name: string, srid?: number) {
		super(name, 'array geometry', 'CockroachGeometry');
		this.config.srid = srid;
	}

	/** @internal */
	override build(table: CockroachTable<any>) {
		return new CockroachGeometry(
			table,
			this.config as any,
		);
	}
}

export class CockroachGeometry<T extends ColumnBaseConfig<'array geometry'>>
	extends CockroachColumn<T, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'CockroachGeometry';

	readonly srid = this.config.srid;
	readonly mode = 'tuple';

	getSQLType(): string {
		return `geometry(point${this.srid === undefined ? '' : `,${this.srid}`})`;
	}

	override mapFromDriverValue(value: string | [number, number]): [number, number] {
		if (typeof value !== 'string') return value as [number, number];

		return parseEWKB(value).point;
	}

	override mapToDriverValue(value: [number, number]): string {
		return `point(${value[0]} ${value[1]})`;
	}
}

export class CockroachGeometryObjectBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'object geometry';
	data: { x: number; y: number };
	driverParam: string;
}, { srid?: number }> {
	static override readonly [entityKind]: string = 'CockroachGeometryObjectBuilder';

	constructor(name: string, srid: number | undefined) {
		super(name, 'object geometry', 'CockroachGeometryObject');
		this.config.srid = srid;
	}

	/** @internal */
	override build(table: CockroachTable<any>) {
		return new CockroachGeometryObject(
			table,
			this.config as any,
		);
	}
}

export class CockroachGeometryObject<T extends ColumnBaseConfig<'object geometry'>>
	extends CockroachColumn<T, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'CockroachGeometryObject';

	readonly srid = this.config.srid;
	readonly mode = 'object';

	getSQLType(): string {
		return `geometry(point${this.srid === undefined ? '' : `,${this.srid}`})`;
	}

	override mapFromDriverValue(value: string): { x: number; y: number } {
		const parsed = parseEWKB(value);
		return { x: parsed.point[0], y: parsed.point[1] };
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
): Equal<TMode, 'xy'> extends true ? CockroachGeometryObjectBuilder : CockroachGeometryBuilder;
export function geometry<TMode extends CockroachGeometryConfig['mode'] & {}>(
	name: string,
	config?: CockroachGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachGeometryObjectBuilder : CockroachGeometryBuilder;
export function geometry(a?: string | CockroachGeometryConfig, b?: CockroachGeometryConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachGeometryConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new CockroachGeometryBuilder(name, config?.srid);
	}
	return new CockroachGeometryObjectBuilder(name, config?.srid);
}
