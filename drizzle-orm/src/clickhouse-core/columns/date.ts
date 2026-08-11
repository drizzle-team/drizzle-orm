import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { castFromString } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';
import { type ClickHouseDateMode, formatClickHouseDate, parseClickHouseDate } from './date.common.ts';

export type ClickHouseDateTypeName = 'Date' | 'Date32';

export interface ClickHouseDateConfig<TMode extends ClickHouseDateMode = ClickHouseDateMode> {
	mode?: TMode;
}

interface ClickHouseDateRuntimeConfig {
	chType: ClickHouseDateTypeName;
	mode: ClickHouseDateMode;
}

export type ClickHouseDateBuilderInitial<
	TName extends string,
	TColumnType extends string,
	TMode extends ClickHouseDateMode,
> = ClickHouseDateBuilder<{
	name: TName;
	dataType: TMode extends 'string' ? 'string' : 'date';
	columnType: TColumnType;
	data: TMode extends 'string' ? string : Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class ClickHouseDateBuilder<T extends ColumnBuilderBaseConfig<'date' | 'string', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseDateRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseDateBuilder';

	constructor(name: T['name'], columnType: T['columnType'], chType: ClickHouseDateTypeName, mode: ClickHouseDateMode) {
		super(name, (mode === 'string' ? 'string' : 'date') as T['dataType'], columnType);
		this.config.chType = chType;
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseDate<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseDate<T extends ColumnBaseConfig<'date' | 'string', string>>
	extends ClickHouseColumn<T, ClickHouseDateRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseDate';

	readonly chType: ClickHouseDateTypeName = this.config.chType;
	readonly mode: ClickHouseDateMode = this.config.mode;

	getBaseSQLType(): string {
		return this.chType;
	}

	override mapFromDriverValue(value: string): Date | string {
		return this.mode === 'string' ? value : parseClickHouseDate(value);
	}

	override mapToDriverValue(value: Date | string): SQL {
		const text = typeof value === 'string' ? value : formatClickHouseDate(value);
		return castFromString(this.chType === 'Date32' ? 'toDate32' : 'toDate', text);
	}

	override mapToRowValue(value: Date | string): string {
		return typeof value === 'string' ? value : formatClickHouseDate(value);
	}
}

function dateFactory<TColumnType extends string>(columnType: TColumnType, chType: ClickHouseDateTypeName) {
	function column(): ClickHouseDateBuilderInitial<'', TColumnType, 'date'>;
	function column<TMode extends ClickHouseDateMode = 'date'>(
		config?: ClickHouseDateConfig<TMode>,
	): ClickHouseDateBuilderInitial<'', TColumnType, TMode>;
	function column<TName extends string, TMode extends ClickHouseDateMode = 'date'>(
		name: TName,
		config?: ClickHouseDateConfig<TMode>,
	): ClickHouseDateBuilderInitial<TName, TColumnType, TMode>;
	function column(a?: string | ClickHouseDateConfig, b?: ClickHouseDateConfig) {
		const { name, config } = getColumnNameAndConfig<ClickHouseDateConfig>(a, b);
		return new ClickHouseDateBuilder(name, columnType, chType, config?.mode ?? 'date');
	}
	return column;
}

/** `Date` — a two-byte calendar date, limited to the range `1970-01-01` … `2149-06-06`. */
export const date = dateFactory('ClickHouseDate', 'Date');

/** `Date32` — a four-byte calendar date covering `1900-01-01` … `2299-12-31`. */
export const date32 = dateFactory('ClickHouseDate32', 'Date32');
