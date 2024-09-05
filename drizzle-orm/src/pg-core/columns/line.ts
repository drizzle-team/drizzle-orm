import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import type { Equal } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';
import { Placeholder, SQL } from '~/sql/sql.ts';

export type PgLineBuilderInitial<TName extends string> = PgLineBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'PgLine';
	data: [number, number, number];
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgLineBuilder<T extends ColumnBuilderBaseConfig<'array', 'PgLine'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgLineBuilder';

	constructor(name: T['name']) {
		super(name, 'array', 'PgLine');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgLineTuple<MakeColumnConfig<T, TTableName>> {
		return new PgLineTuple<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgLineTuple<T extends ColumnBaseConfig<'array', 'PgLine'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgLine';

	getSQLType(): string {
		return 'line';
	}

	override mapFromDriverValue(value: string): [number, number, number] {
		const [a, b, c] = value.slice(1, -1).split(',');
		return [Number.parseFloat(a!), Number.parseFloat(b!), Number.parseFloat(c!)];
	}

	override mapToDriverValue(value: [number, number, number] | SQL | Placeholder): string | SQL | Placeholder {
		return Array.isArray(value) ? `{${value[0]},${value[1]},${value[2]}}` : value;
	}
}

export type PgLineABCBuilderInitial<TName extends string> = PgLineABCBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgLineABC';
	data: { a: number; b: number; c: number };
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgLineABCBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgLineABC'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgLineABCBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgLineABC');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgLineABC<MakeColumnConfig<T, TTableName>> {
		return new PgLineABC<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgLineABC<T extends ColumnBaseConfig<'json', 'PgLineABC'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgLineABC';

	getSQLType(): string {
		return 'line';
	}

	override mapFromDriverValue(value: string): { a: number; b: number; c: number } {
		const [a, b, c] = value.slice(1, -1).split(',');
		return { a: Number.parseFloat(a!), b: Number.parseFloat(b!), c: Number.parseFloat(c!) };
	}

	override mapToDriverValue(value: { a: number; b: number; c: number } | SQL | Placeholder): string | SQL | Placeholder {
		return is(value, SQL) || is(value, Placeholder)
			? value
			: `{${(value as any).a},${(value as any).b},${(value as any).c}}`;
	}
}

export interface PgLineTypeConfig<T extends 'tuple' | 'abc' = 'tuple' | 'abc'> {
	mode?: T;
}

export function line<TName extends string, TMode extends PgLineTypeConfig['mode'] & {}>(
	name: TName,
	config?: PgLineTypeConfig<TMode>,
): Equal<TMode, 'abc'> extends true ? PgLineABCBuilderInitial<TName>
	: PgLineBuilderInitial<TName>;
export function line(name: string, config?: PgLineTypeConfig) {
	if (!config?.mode || config.mode === 'tuple') {
		return new PgLineBuilder(name);
	}

	return new PgLineABCBuilder(name);
}
