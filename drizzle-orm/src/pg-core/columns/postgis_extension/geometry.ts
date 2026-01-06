import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import type { PgColumnBaseConfig } from '../common.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export class PgGeometryBuilder extends PgColumnBuilder<{
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}, { srid: number | undefined }> {
	static override readonly [entityKind]: string = 'PgGeometryBuilder';

	constructor(name: string, srid?: number) {
		super(name, 'array geometry', 'PgGeometry');
		this.config.srid = srid;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgGeometry(
			table,
			this.config as any,
		);
	}
}

export class PgGeometry
	extends PgColumn<'array geometry', PgColumnBaseConfig<'array geometry'>, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgGeometry';

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

export class PgGeometryObjectBuilder extends PgColumnBuilder<{
	dataType: 'object geometry';
	data: { x: number; y: number };
	driverParam: string;
}, { srid?: number }> {
	static override readonly [entityKind]: string = 'PgGeometryObjectBuilder';

	constructor(name: string, srid: number | undefined) {
		super(name, 'object geometry', 'PgGeometryObject');
		this.config.srid = srid;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgGeometryObject(
			table,
			this.config as any,
		);
	}
}

export class PgGeometryObject
	extends PgColumn<'object geometry', PgColumnBaseConfig<'object geometry'>, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgGeometryObject';

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
		return new PgGeometryBuilder(name, config?.srid);
	}
	return new PgGeometryObjectBuilder(name, config?.srid);
}
