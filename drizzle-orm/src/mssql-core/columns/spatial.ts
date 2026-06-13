import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export interface MsSqlSpatialConfig<TMode extends 'raw' | 'wkt' | 'tuple' | 'xy' = 'raw' | 'wkt' | 'tuple' | 'xy'> {
	mode?: TMode;
	srid?: number;
}

const parsePoint = (value: string): [number, number] => {
	const match = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec(value.trim());
	if (!match) {
		throw new Error(`Expected POINT WKT, received: ${value}`);
	}

	return [Number(match[1]), Number(match[2])];
};

const pointToWkt = (x: number, y: number) => `POINT (${x} ${y})`;

export class MsSqlGeographyBuilder extends MsSqlColumnBuilder<{
	dataType: 'object geometry';
	data: unknown;
	driverParam: unknown;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeographyBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'object geometry', 'MsSqlGeography');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeography(table, this.config);
	}
}

export class MsSqlGeography<T extends ColumnBaseConfig<'object geometry'>> extends MsSqlColumn<T, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeography';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geography';
	}
}

export class MsSqlGeographyWktBuilder extends MsSqlColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeographyWktBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'string', 'MsSqlGeographyWkt');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeographyWkt(table, this.config);
	}
}

export class MsSqlGeographyWkt<T extends ColumnBaseConfig<'string'>> extends MsSqlColumn<T, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeographyWkt';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geography';
	}

	override mapFromDriverValue = (value: unknown): string => String(value);
}

export class MsSqlGeographyTupleBuilder extends MsSqlColumnBuilder<{
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeographyTupleBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'array geometry', 'MsSqlGeographyTuple');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeographyTuple(table, this.config);
	}
}

export class MsSqlGeographyTuple<T extends ColumnBaseConfig<'array geometry'>>
	extends MsSqlColumn<T, MsSqlSpatialConfig>
{
	static override readonly [entityKind]: string = 'MsSqlGeographyTuple';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geography';
	}

	override mapFromDriverValue = (value: string): [number, number] => parsePoint(value);

	override mapToDriverValue = (value: [number, number]): string => pointToWkt(value[0], value[1]);
}

export class MsSqlGeographyObjectBuilder extends MsSqlColumnBuilder<{
	dataType: 'object geometry';
	data: { x: number; y: number };
	driverParam: string;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeographyObjectBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'object geometry', 'MsSqlGeographyObject');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeographyObject(table, this.config);
	}
}

export class MsSqlGeographyObject<T extends ColumnBaseConfig<'object geometry'>>
	extends MsSqlColumn<T, MsSqlSpatialConfig>
{
	static override readonly [entityKind]: string = 'MsSqlGeographyObject';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geography';
	}

	override mapFromDriverValue = (value: string): { x: number; y: number } => {
		const [x, y] = parsePoint(value);
		return { x, y };
	};

	override mapToDriverValue = (value: { x: number; y: number }): string => pointToWkt(value.x, value.y);
}

export class MsSqlGeometryBuilder extends MsSqlColumnBuilder<{
	dataType: 'object geometry';
	data: unknown;
	driverParam: unknown;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeometryBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'object geometry', 'MsSqlGeometry');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeometry(table, this.config);
	}
}

export class MsSqlGeometry<T extends ColumnBaseConfig<'object geometry'>> extends MsSqlColumn<T, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeometry';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geometry';
	}
}

export class MsSqlGeometryWktBuilder extends MsSqlColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeometryWktBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'string', 'MsSqlGeometryWkt');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeometryWkt(table, this.config);
	}
}

export class MsSqlGeometryWkt<T extends ColumnBaseConfig<'string'>> extends MsSqlColumn<T, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeometryWkt';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geometry';
	}

	override mapFromDriverValue = (value: unknown): string => String(value);
}

export class MsSqlGeometryTupleBuilder extends MsSqlColumnBuilder<{
	dataType: 'array geometry';
	data: [number, number];
	driverParam: string;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeometryTupleBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'array geometry', 'MsSqlGeometryTuple');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeometryTuple(table, this.config);
	}
}

export class MsSqlGeometryTuple<T extends ColumnBaseConfig<'array geometry'>>
	extends MsSqlColumn<T, MsSqlSpatialConfig>
{
	static override readonly [entityKind]: string = 'MsSqlGeometryTuple';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geometry';
	}

	override mapFromDriverValue = (value: string): [number, number] => parsePoint(value);

	override mapToDriverValue = (value: [number, number]): string => pointToWkt(value[0], value[1]);
}

export class MsSqlGeometryObjectBuilder extends MsSqlColumnBuilder<{
	dataType: 'object geometry';
	data: { x: number; y: number };
	driverParam: string;
}, MsSqlSpatialConfig> {
	static override readonly [entityKind]: string = 'MsSqlGeometryObjectBuilder';

	constructor(name: string, config?: MsSqlSpatialConfig) {
		super(name, 'object geometry', 'MsSqlGeometryObject');
		this.config.srid = config?.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeometryObject(table, this.config);
	}
}

export class MsSqlGeometryObject<T extends ColumnBaseConfig<'object geometry'>>
	extends MsSqlColumn<T, MsSqlSpatialConfig>
{
	static override readonly [entityKind]: string = 'MsSqlGeometryObject';

	readonly srid: number | undefined = this.config.srid;

	getSQLType(): string {
		return 'geometry';
	}

	override mapFromDriverValue = (value: string): { x: number; y: number } => {
		const [x, y] = parsePoint(value);
		return { x, y };
	};

	override mapToDriverValue = (value: { x: number; y: number }): string => pointToWkt(value.x, value.y);
}

export function geography(): MsSqlGeographyBuilder;
export function geography<TMode extends MsSqlSpatialConfig['mode'] & {}>(
	config: MsSqlSpatialConfig<TMode>,
): Equal<TMode, 'wkt'> extends true ? MsSqlGeographyWktBuilder
	: Equal<TMode, 'tuple'> extends true ? MsSqlGeographyTupleBuilder
	: Equal<TMode, 'xy'> extends true ? MsSqlGeographyObjectBuilder
	: MsSqlGeographyBuilder;
export function geography<TMode extends MsSqlSpatialConfig['mode'] & {}>(
	name: string,
	config?: MsSqlSpatialConfig<TMode>,
): Equal<TMode, 'wkt'> extends true ? MsSqlGeographyWktBuilder
	: Equal<TMode, 'tuple'> extends true ? MsSqlGeographyTupleBuilder
	: Equal<TMode, 'xy'> extends true ? MsSqlGeographyObjectBuilder
	: MsSqlGeographyBuilder;
export function geography(a?: string | MsSqlSpatialConfig, b?: MsSqlSpatialConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlSpatialConfig>(a, b);
	if (config?.mode === 'wkt') return new MsSqlGeographyWktBuilder(name, config);
	if (config?.mode === 'tuple') return new MsSqlGeographyTupleBuilder(name, config);
	if (config?.mode === 'xy') return new MsSqlGeographyObjectBuilder(name, config);
	return new MsSqlGeographyBuilder(name, config);
}

export function geometry(): MsSqlGeometryBuilder;
export function geometry<TMode extends MsSqlSpatialConfig['mode'] & {}>(
	config: MsSqlSpatialConfig<TMode>,
): Equal<TMode, 'wkt'> extends true ? MsSqlGeometryWktBuilder
	: Equal<TMode, 'tuple'> extends true ? MsSqlGeometryTupleBuilder
	: Equal<TMode, 'xy'> extends true ? MsSqlGeometryObjectBuilder
	: MsSqlGeometryBuilder;
export function geometry<TMode extends MsSqlSpatialConfig['mode'] & {}>(
	name: string,
	config?: MsSqlSpatialConfig<TMode>,
): Equal<TMode, 'wkt'> extends true ? MsSqlGeometryWktBuilder
	: Equal<TMode, 'tuple'> extends true ? MsSqlGeometryTupleBuilder
	: Equal<TMode, 'xy'> extends true ? MsSqlGeometryObjectBuilder
	: MsSqlGeometryBuilder;
export function geometry(a?: string | MsSqlSpatialConfig, b?: MsSqlSpatialConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlSpatialConfig>(a, b);
	if (config?.mode === 'wkt') return new MsSqlGeometryWktBuilder(name, config);
	if (config?.mode === 'tuple') return new MsSqlGeometryTupleBuilder(name, config);
	if (config?.mode === 'xy') return new MsSqlGeometryObjectBuilder(name, config);
	return new MsSqlGeometryBuilder(name, config);
}
