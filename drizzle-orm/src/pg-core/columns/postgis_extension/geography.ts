import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import type { Equal } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';
import { parseEWKB } from './utils.ts';

export type PgGeographyBuilderInitial<TName extends string> = PgGeographyBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgGeography';
	data: [number, number];
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgGeographyBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgGeography'>>
	extends PgColumnBuilder<T, { type: PgGeographyConfig['type']; srid: PgGeographyConfig['srid'] }>
{
	static override readonly [entityKind]: string = 'PgGeographyBuilder';

	constructor(name: T['name'], config?: PgGeographyConfig) {
		super(name, 'array', 'PgGeography');
		this.config.srid = config?.srid;
		this.config.type = config?.type;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgGeography<MakeColumnConfig<T, TTableName>> {
		return new PgGeography<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgGeography<T extends ColumnBaseConfig<'array', 'PgGeography'>>
	extends PgColumn<T, { type: PgGeographyConfig['type']; srid: PgGeographyConfig['srid'] }>
{
	static override readonly [entityKind]: string = 'PgGeography';

	readonly type = this.config.type;
	readonly srid = this.config.srid;

	getSQLType(): string {
		return `geography${
			this.type || this.srid ? `(${this.type ?? ''}${this.srid ? this.type ? `,${this.srid}` : this.srid : ''})` : ''
		}`;
	}

	override mapFromDriverValue(value: string): [number, number] {
		return parseEWKB(value);
	}

	override mapToDriverValue(value: [number, number]): string {
		return `point(${value[0]} ${value[1]})`;
	}
}

export type PgGeographyObjectBuilderInitial<TName extends string> = PgGeographyObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgGeographyObject';
	data: { x: number; y: number };
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgGeographyObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgGeographyObject'>>
	extends PgColumnBuilder<T, { type: PgGeographyConfig['type']; srid: PgGeographyConfig['srid'] }>
{
	static override readonly [entityKind]: string = 'PgGeographyObjectBuilder';

	constructor(name: T['name'], config?: PgGeographyConfig) {
		super(name, 'json', 'PgGeographyObject');
		this.config.srid = config?.srid;
		this.config.type = config?.type;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgGeographyObject<MakeColumnConfig<T, TTableName>> {
		return new PgGeographyObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgGeographyObject<T extends ColumnBaseConfig<'json', 'PgGeographyObject'>>
	extends PgColumn<T, { type: PgGeographyConfig['type']; srid: PgGeographyConfig['srid'] }>
{
	static override readonly [entityKind]: string = 'PgGeographyObject';

	readonly type = this.config.type;
	readonly srid = this.config.srid;

	getSQLType(): string {
		return `geography${
			this.type || this.srid ? `(${this.type ?? ''}${this.srid ? this.type ? `,${this.srid}` : this.srid : ''})` : ''
		}`;
	}

	override mapFromDriverValue(value: string): { x: number; y: number } {
		const parsed = parseEWKB(value);
		return { x: parsed[0], y: parsed[1] };
	}

	override mapToDriverValue(value: { x: number; y: number }): string {
		return `geography(${value.x} ${value.y})`;
	}
}

interface PgGeographyConfig<T extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
	mode?: T;
	type?: 'point' | (string & {});
	srid?: number;
}

export function geography<TName extends string, TMode extends PgGeographyConfig['mode'] & {}>(
	name: TName,
	config?: PgGeographyConfig<TMode>,
): Equal<TMode, 'xy'> extends true ? PgGeographyObjectBuilderInitial<TName>
	: PgGeographyBuilderInitial<TName>;
export function geography(name: string, config?: PgGeographyConfig) {
	if (!config?.mode || config.mode === 'tuple') {
		return new PgGeographyBuilder(name, config);
	}
	return new PgGeographyObjectBuilder(name, config);
}
