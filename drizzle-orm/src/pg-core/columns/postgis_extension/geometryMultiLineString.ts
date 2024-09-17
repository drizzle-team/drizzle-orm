import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';

import { PgColumn, PgColumnBuilder } from '../common.ts';
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import type { geometry } from './geometry.ts';
import { parseMultiLineStringEWKB } from './utils.ts';

export type PgGeometryMultiLineStringBuilderInitial<TName extends string> = PgGeometryMultiLineStringBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgGeometryMultiLineString';
	data: [number, number][][];
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgGeometryMultiLineStringBuilder<
	T extends ColumnBuilderBaseConfig<'array', 'PgGeometryMultiLineString'>,
> extends PgColumnBuilder<T, PgGeometryMultiLineStringConfig> {
	static readonly [entityKind]: string = 'PgGeometryMultiLineStringBuilder';

	constructor(name: T['name'], config: PgGeometryMultiLineStringConfig = {}) {
		super(name, 'array', 'PgGeometryMultiLineString');
		this.config.srid = config.srid;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgGeometryMultiLineString<MakeColumnConfig<T, TTableName>> {
		return new PgGeometryMultiLineString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgGeometryMultiLineString<
	T extends ColumnBaseConfig<'array', 'PgGeometryMultiLineString'>,
> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgGeometryMultiLineString';

	readonly srid: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgGeometryMultiLineStringBuilder<T>['config']) {
		super(table, config);
		this.srid = config.srid;
	}

	getSQLType(): string {
		if (this.srid) return `geometry(multilinestring, ${this.srid})`;
		return 'geometry(multilinestring)';
	}

	override mapFromDriverValue(value: string): [number, number][][] {
		return parseMultiLineStringEWKB(value);
	}

	override mapToDriverValue(value: [number, number][][]): string {
		const multilinestring = `MultiLineString(${
			value
				.map((line) => `(${line.map(([x, y]) => `${x} ${y}`).join(',')})`)
				.join(',')
		})`;

		if (this.srid) {
			return `ST_GeomFromText('${multilinestring}', ${this.srid})`;
		}
		return multilinestring;
	}
}

export interface PgGeometryMultiLineStringConfig {
	srid?: number;
}

/** @deprecated Use {@link geometry} with `type: 'multilinestring'` instead. */
export function geometryMultiLineString<TName extends string>(
	name: TName,
	config: PgGeometryMultiLineStringConfig = {},
): PgGeometryMultiLineStringBuilderInitial<TName> {
	return new PgGeometryMultiLineStringBuilder(name, config);
}
