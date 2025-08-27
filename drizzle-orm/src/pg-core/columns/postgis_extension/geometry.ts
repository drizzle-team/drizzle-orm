import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export type PgGeometryBuilderInitial<TName extends string> = PgGeometryBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgGeometry';
	data: [number, number];
	driverParam: string;
	enumValues: undefined;
}>;

export class PgGeometryBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgGeometry'>>
	extends PgColumnBuilder<T, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgGeometryBuilder';

	constructor(name: T['name'], srid?: number) {
		super(name, 'array', 'PgGeometry');
		this.config.srid = srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgGeometry<MakeColumnConfig<T, TTableName>> {
		return new PgGeometry<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgGeometry<T extends ColumnBaseConfig<'array', 'PgGeometry'>>
	extends PgColumn<T, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgGeometry';

	readonly srid = this.config.srid;
	readonly mode = 'tuple';

	getSQLType(): string {
		return 'geometry(point)';
	}

	override mapFromDriverValue(value: string): [number, number] {
		return parseEWKB(value).point;
	}

	override mapToDriverValue(value: [number, number]): string {
		return `point(${value[0]} ${value[1]})`;
	}
}

export type PgGeometryObjectBuilderInitial<TName extends string> = PgGeometryObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgGeometryObject';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
}>;

export class PgGeometryObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgGeometryObject'>>
	extends PgColumnBuilder<T, { srid?: number }>
{
	static override readonly [entityKind]: string = 'PgGeometryObjectBuilder';

	constructor(name: T['name'], srid: number | undefined) {
		super(name, 'json', 'PgGeometryObject');
		this.config.srid = srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgGeometryObject<MakeColumnConfig<T, TTableName>> {
		return new PgGeometryObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgGeometryObject<T extends ColumnBaseConfig<'json', 'PgGeometryObject'>>
	extends PgColumn<T, { srid: number | undefined }>
{
	static override readonly [entityKind]: string = 'PgGeometryObject';

	readonly srid = this.config.srid;
	readonly mode = 'object';

	getSQLType(): string {
		return 'geometry(point)';
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

export function geometry(): PgGeometryBuilderInitial<''>;
export function geometry<TMode extends PgGeometryConfig['mode'] & {}>(
	config?: PgGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgGeometryObjectBuilderInitial<''> : PgGeometryBuilderInitial<''>;
export function geometry<TName extends string, TMode extends PgGeometryConfig['mode'] & {}>(
	name: TName,
	config?: PgGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgGeometryObjectBuilderInitial<TName> : PgGeometryBuilderInitial<TName>;
export function geometry(a?: string | PgGeometryConfig, b?: PgGeometryConfig) {
	const { name, config } = getColumnNameAndConfig<PgGeometryConfig>(a, b);
	if (!config?.mode || config.mode === 'tuple') {
		return new PgGeometryBuilder(name, config?.srid);
	}
	return new PgGeometryObjectBuilder(name, config?.srid);
}
