import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import type { Equal } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export type PgGeometryBuilderInitial<TName extends string> = PgGeometryBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgGeometry';
	data: [number, number];
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgGeometryBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgGeometry'>> extends PgColumnBuilder<T, PgGeometryConfig> {
	static readonly [entityKind]: string = 'PgGeometryBuilder';

	constructor(name: T['name'], config: PgGeometryConfig = {}) {
		super(name, 'array', 'PgGeometry');
		this.config.srid = config.srid;
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

export class PgGeometry<T extends ColumnBaseConfig<'array', 'PgGeometry'>> extends PgColumn<T, PgGeometryConfig> {
	static readonly [entityKind]: string = 'PgGeometry';

	getSQLType(): string {
		const { srid } = this.config;
		return `geometry(point${srid ? `,${srid}` : ''})`;
	}

	override mapFromDriverValue(value: string): [number, number] {
		return parseEWKB(value);
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
	generated: undefined;
}>;

export class PgGeometryObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgGeometryObject'>>
	extends PgColumnBuilder<T, PgGeometryConfig>
{
	static readonly [entityKind]: string = 'PgGeometryObjectBuilder';

	constructor(name: T['name'], config: PgGeometryConfig = {}) {
		super(name, 'json', 'PgGeometryObject');
		this.config.srid = config.srid;
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

export class PgGeometryObject<T extends ColumnBaseConfig<'json', 'PgGeometryObject'>> extends PgColumn<T, PgGeometryConfig> {
	static readonly [entityKind]: string = 'PgGeometryObject';

	getSQLType(): string {
		const { srid } = this.config;
		return `geometry(point${srid ? `,${srid}` : ''})`;
	}

	override mapFromDriverValue(value: string): { x: number; y: number } {
		const parsed = parseEWKB(value);
		return { x: parsed[0], y: parsed[1] };
	}

	override mapToDriverValue(value: { x: number; y: number }): string {
		return `point(${value.x} ${value.y})`;
	}
}

interface PgGeometryConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
	type?: 'point' | (string & {});
	srid?: number;
}

export function geometry<TName extends string, TMode extends PgGeometryConfig['mode'] & {}>(
	name: TName,
	config?: PgGeometryConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgGeometryObjectBuilderInitial<TName>
	: PgGeometryBuilderInitial<TName>;
export function geometry(name: string, config?: PgGeometryConfig) {
	if (!config?.mode || config.mode === 'tuple') {
		return new PgGeometryBuilder(name, config);
	}
	return new PgGeometryObjectBuilder(name, config);
}
