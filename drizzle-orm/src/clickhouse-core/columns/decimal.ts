import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

/**
 * How a decimal is surfaced in TypeScript. `string` (the default) is lossless; `number` is
 * convenient but silently rounds anything beyond double precision.
 */
export type ClickHouseDecimalMode = 'string' | 'number';

/** The fixed-width `DecimalN` types, or `Decimal` when an explicit precision is given. */
export type ClickHouseDecimalTypeName = 'Decimal' | 'Decimal32' | 'Decimal64' | 'Decimal128' | 'Decimal256';

/** The precision ClickHouse implies for each fixed-width decimal type. */
const IMPLIED_PRECISION: Record<Exclude<ClickHouseDecimalTypeName, 'Decimal'>, number> = {
	Decimal32: 9,
	Decimal64: 18,
	Decimal128: 38,
	Decimal256: 76,
};

export interface ClickHouseDecimalConfig<TMode extends ClickHouseDecimalMode = ClickHouseDecimalMode> {
	/** Total number of significant digits. Only accepted by {@link decimal}. */
	precision?: number;
	/** Number of digits after the decimal point. */
	scale?: number;
	mode?: TMode;
}

interface ClickHouseDecimalRuntimeConfig {
	chType: ClickHouseDecimalTypeName;
	precision: number | undefined;
	scale: number;
	mode: ClickHouseDecimalMode;
}

export type ClickHouseDecimalBuilderInitial<
	TName extends string,
	TColumnType extends string,
	TMode extends ClickHouseDecimalMode,
> = ClickHouseDecimalBuilder<{
	name: TName;
	dataType: TMode extends 'number' ? 'number' : 'string';
	columnType: TColumnType;
	data: TMode extends 'number' ? number : string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class ClickHouseDecimalBuilder<T extends ColumnBuilderBaseConfig<'string' | 'number', string>>
	extends ClickHouseColumnBuilder<T, ClickHouseDecimalRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseDecimalBuilder';

	constructor(
		name: T['name'],
		columnType: T['columnType'],
		chType: ClickHouseDecimalTypeName,
		config: ClickHouseDecimalConfig | undefined,
	) {
		super(name, (config?.mode === 'number' ? 'number' : 'string') as T['dataType'], columnType);
		this.config.chType = chType;
		this.config.precision = chType === 'Decimal' ? (config?.precision ?? 10) : undefined;
		this.config.scale = config?.scale ?? 0;
		this.config.mode = config?.mode ?? 'string';
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseDecimal<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseDecimal<T extends ColumnBaseConfig<'string' | 'number', string>>
	extends ClickHouseColumn<T, ClickHouseDecimalRuntimeConfig>
{
	static override readonly [entityKind]: string = 'ClickHouseDecimal';

	readonly chType: ClickHouseDecimalTypeName = this.config.chType;
	readonly precision: number | undefined = this.config.precision;
	readonly scale: number = this.config.scale;
	readonly mode: ClickHouseDecimalMode = this.config.mode;

	getBaseSQLType(): string {
		return this.chType === 'Decimal'
			? `Decimal(${this.precision}, ${this.scale})`
			: `${this.chType}(${this.scale})`;
	}

	override mapFromDriverValue(value: string | number): string | number {
		return this.mode === 'number'
			? (typeof value === 'number' ? value : Number(value))
			: (typeof value === 'string' ? value : String(value));
	}

	override mapToDriverValue(value: string | number): SQL {
		// Routing through a string literal and an explicit cast keeps the full precision that a
		// JavaScript `number` would have already lost by this point.
		return sql`CAST(${String(value)} AS ${sql.raw(this.getBaseSQLType())})`;
	}

	/** A string, for the same reason the literal path casts from one: a JSON number loses the scale. */
	override mapToRowValue(value: string | number): string {
		return String(value);
	}

	/** The total number of significant digits ClickHouse allows for this column. */
	get effectivePrecision(): number {
		return this.chType === 'Decimal' ? this.precision! : IMPLIED_PRECISION[this.chType];
	}
}

/** `Decimal(P, S)` — a fixed-point number with `P` significant digits, `S` of them after the point. */
export function decimal<TMode extends ClickHouseDecimalMode = 'string'>(
	config?: ClickHouseDecimalConfig<TMode>,
): ClickHouseDecimalBuilderInitial<'', 'ClickHouseDecimal', TMode>;
export function decimal<TName extends string, TMode extends ClickHouseDecimalMode = 'string'>(
	name: TName,
	config?: ClickHouseDecimalConfig<TMode>,
): ClickHouseDecimalBuilderInitial<TName, 'ClickHouseDecimal', TMode>;
export function decimal(a?: string | ClickHouseDecimalConfig, b?: ClickHouseDecimalConfig) {
	const { name, config } = getColumnNameAndConfig<ClickHouseDecimalConfig>(a, b);
	return new ClickHouseDecimalBuilder(name, 'ClickHouseDecimal', 'Decimal', config);
}

function fixedDecimalFactory<TColumnType extends string>(
	columnType: TColumnType,
	chType: Exclude<ClickHouseDecimalTypeName, 'Decimal'>,
) {
	function column<TMode extends ClickHouseDecimalMode = 'string'>(
		config?: Omit<ClickHouseDecimalConfig<TMode>, 'precision'>,
	): ClickHouseDecimalBuilderInitial<'', TColumnType, TMode>;
	function column<TName extends string, TMode extends ClickHouseDecimalMode = 'string'>(
		name: TName,
		config?: Omit<ClickHouseDecimalConfig<TMode>, 'precision'>,
	): ClickHouseDecimalBuilderInitial<TName, TColumnType, TMode>;
	function column(a?: string | ClickHouseDecimalConfig, b?: ClickHouseDecimalConfig) {
		const { name, config } = getColumnNameAndConfig<ClickHouseDecimalConfig>(a, b);
		return new ClickHouseDecimalBuilder(name, columnType, chType, config);
	}
	return column;
}

/** `Decimal32(S)` — up to 9 significant digits. */
export const decimal32 = fixedDecimalFactory('ClickHouseDecimal32', 'Decimal32');

/** `Decimal64(S)` — up to 18 significant digits. */
export const decimal64 = fixedDecimalFactory('ClickHouseDecimal64', 'Decimal64');

/** `Decimal128(S)` — up to 38 significant digits. */
export const decimal128 = fixedDecimalFactory('ClickHouseDecimal128', 'Decimal128');

/** `Decimal256(S)` — up to 76 significant digits. */
export const decimal256 = fixedDecimalFactory('ClickHouseDecimal256', 'Decimal256');
