import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export type CockroachGeometryBuilderInitial<TName extends string> = CockroachGeometryBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'CockroachGeometry';
	data: [number, number];
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachGeometryBuilder<T extends ColumnBuilderBaseConfig<'array', 'CockroachGeometry'>>
	extends CockroachColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachGeometryBuilder';

	constructor(name: T['name']) {
		super(name, 'array', 'CockroachGeometry');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachGeometry<MakeColumnConfig<T, TTableName>> {
		return new CockroachGeometry<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachGeometry<T extends ColumnBaseConfig<'array', 'CockroachGeometry'>> extends CockroachColumn<T> {
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

export type CockroachGeometryObjectBuilderInitial<TName extends string> = CockroachGeometryObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'CockroachGeometryObject';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachGeometryObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'CockroachGeometryObject'>>
	extends CockroachColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachGeometryObjectBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'CockroachGeometryObject');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachGeometryObject<MakeColumnConfig<T, TTableName>> {
		return new CockroachGeometryObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachGeometryObject<T extends ColumnBaseConfig<'json', 'CockroachGeometryObject'>>
	extends CockroachColumn<T>
{
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

export function geometry(): CockroachGeometryBuilderInitial<''>;
export function geometry<TMode extends CockroachGeometryConfig['mode'] & {}>(
	config?: CockroachGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachGeometryObjectBuilderInitial<''>
	: CockroachGeometryBuilderInitial<''>;
export function geometry<TName extends string, TMode extends CockroachGeometryConfig['mode'] & {}>(
	name: TName,
	config?: CockroachGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachGeometryObjectBuilderInitial<TName>
	: CockroachGeometryBuilderInitial<TName>;
export function geometry(a?: string | CockroachGeometryConfig, b?: CockroachGeometryConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachGeometryConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new CockroachGeometryBuilder(name);
	}
	return new CockroachGeometryObjectBuilder(name);
}
