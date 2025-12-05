import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './ewkb.ts';
import type { PgGeometryConfig } from './types.ts';

export class PgGeometryBuilder extends PgColumnBuilder<{
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}, PgGeometryConfig> {
	static override readonly [entityKind]: string = 'PgGeometryBuilder';

	static readonly defaultConfig: PgGeometryConfig = { type: 'Point' };

	constructor(name: string, config: PgGeometryConfig = PgGeometryBuilder.defaultConfig) {
		super(name, 'array geometry', 'PgGeometry');
		this.config.type = config.type;
		this.config.srid = config.srid;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgGeometry(
			table,
			this.config,
		);
	}
}

export class PgGeometry<T extends ColumnBaseConfig<'array geometry'>> extends PgColumn<T, PgGeometryConfig> {
	static override readonly [entityKind]: string = 'PgGeometry';

	readonly srid = this.config.srid;
	readonly type = this.config.type;
	readonly mode = 'tuple';

	getSQLType(): string {
		const type = this.type ?? 'Point';
		const srid = this.srid;

		return `geometry(${type}${srid ? `,${srid}` : ''})`;
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
}, PgGeometryConfig> {
	static override readonly [entityKind]: string = 'PgGeometryObjectBuilder';

	constructor(name: string, config: PgGeometryConfig) {
		super(name, 'object geometry', 'PgGeometryObject');
		this.config.type = config.type;
		this.config.srid = config.srid;
		this.config.mode = config.mode;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgGeometryObject(
			table,
			this.config as any,
		);
	}
}

export class PgGeometryObject<T extends ColumnBaseConfig<'object geometry'>> extends PgColumn<T, PgGeometryConfig> {
	static override readonly [entityKind]: string = 'PgGeometryObject';

	readonly srid = this.config.srid;
	readonly type = this.config.type;
	readonly mode = 'object';

	getSQLType(): string {
		const type = this.type ?? 'Point';
		const srid = this.srid;

		return `geometry(${type}${srid ? `,${srid}` : ''})`;
	}

	override mapFromDriverValue(value: string): { x: number; y: number } {
		const parsed = parseEWKB(value);
		return { x: parsed.point[0], y: parsed.point[1] };
	}

	override mapToDriverValue(value: { x: number; y: number }): string {
		let wkt = `point(${value.x} ${value.y})`;

		if (this.srid) {
			wkt = `SRID=${this.srid};${wkt}`;
		}

		return wkt;
	}
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
		return new PgGeometryBuilder(name, config);
	}
	return new PgGeometryObjectBuilder(name, config);
}
