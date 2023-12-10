import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import type { MsSqlDatetimeConfig } from './date.common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export type MsSqlDateTime2BuilderInitial<TName extends string> = MsSqlDateTime2Builder<{
	name: TName;
	dataType: 'date';
	columnType: 'MsSqlDateTime2';
	data: Date;
	driverParam: string | Date;
	enumValues: undefined;
}>;

export class MsSqlDateTime2Builder<T extends ColumnBuilderBaseConfig<'date', 'MsSqlDateTime2'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MsSqlDateTime2Builder';

	constructor(name: T['name'], config: MsSqlDatetimeConfig | undefined) {
		super(name, 'date', 'MsSqlDateTime2');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateTime2<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateTime2<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateTime2<T extends ColumnBaseConfig<'date', 'MsSqlDateTime2'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDateTime2';

	readonly precision: number | undefined;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateTime2Builder<T>['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetime2${precision}`;
	}
}

export type MsSqlDateTime2StringBuilderInitial<TName extends string> = MsSqlDateTime2StringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlDateTime2String';
	data: string;
	driverParam: string | Date;
	enumValues: undefined;
}>;

export class MsSqlDateTime2StringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlDateTime2String'>>
	extends MsSqlDateColumnBaseBuilder<T, MsSqlDatetimeConfig>
{
	static readonly [entityKind]: string = 'MsSqlDateTime2StringBuilder';

	constructor(name: T['name'], config: MsSqlDatetimeConfig | undefined) {
		super(name, 'string', 'MsSqlDateTime2String');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDateTime2String<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDateTime2String<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDateTime2String<T extends ColumnBaseConfig<'string', 'MsSqlDateTime2String'>> extends MsSqlColumn<T> {
	static readonly [entityKind]: string = 'MsSqlDateTime2String';

	readonly precision: number | undefined;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlDateTime2StringBuilder<T>['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetime2${precision}`;
	}

	override mapFromDriverValue(value: Date | string | null): string | null {
		return typeof value === 'string' ? value : value?.toISOString() ?? null;
	}
}

export function datetime2<TName extends string, TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTime2StringBuilderInitial<TName>
	: MsSqlDateTime2BuilderInitial<TName>;
export function datetime2(name: string, config: MsSqlDatetimeConfig = {}) {
	if (config.mode === 'string') {
		return new MsSqlDateTime2StringBuilder(name, config);
	}
	return new MsSqlDateTime2Builder(name, config);
}
