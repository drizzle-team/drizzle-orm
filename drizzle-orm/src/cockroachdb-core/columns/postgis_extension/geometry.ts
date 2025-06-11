import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export type CockroachDbGeometryBuilderInitial<TName extends string> = CockroachDbGeometryBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'CockroachDbGeometry';
	data: [number, number];
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbGeometryBuilder<T extends ColumnBuilderBaseConfig<'array', 'CockroachDbGeometry'>>
	extends CockroachDbColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbGeometryBuilder';

	constructor(name: T['name']) {
		super(name, 'array', 'CockroachDbGeometry');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbGeometry<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbGeometry<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbGeometry<T extends ColumnBaseConfig<'array', 'CockroachDbGeometry'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbGeometry';

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

export type CockroachDbGeometryObjectBuilderInitial<TName extends string> = CockroachDbGeometryObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'CockroachDbGeometryObject';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbGeometryObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'CockroachDbGeometryObject'>>
	extends CockroachDbColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbGeometryObjectBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'CockroachDbGeometryObject');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbGeometryObject<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbGeometryObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbGeometryObject<T extends ColumnBaseConfig<'json', 'CockroachDbGeometryObject'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbGeometryObject';

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

export interface CockroachDbGeometryConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
	type?: 'point' | (string & {});
	srid?: number;
}

export function geometry(): CockroachDbGeometryBuilderInitial<''>;
export function geometry<TMode extends CockroachDbGeometryConfig['mode'] & {}>(
	config?: CockroachDbGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachDbGeometryObjectBuilderInitial<''>
	: CockroachDbGeometryBuilderInitial<''>;
export function geometry<TName extends string, TMode extends CockroachDbGeometryConfig['mode'] & {}>(
	name: TName,
	config?: CockroachDbGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? CockroachDbGeometryObjectBuilderInitial<TName>
	: CockroachDbGeometryBuilderInitial<TName>;
export function geometry(a?: string | CockroachDbGeometryConfig, b?: CockroachDbGeometryConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbGeometryConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new CockroachDbGeometryBuilder(name);
	}
	return new CockroachDbGeometryObjectBuilder(name);
}
