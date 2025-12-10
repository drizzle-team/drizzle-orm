import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn } from './common.ts';
import type { MsSqlDatetimeConfig } from './date.common.ts';
import { MsSqlDateColumnBaseBuilder } from './date.common.ts';

export class MsSqlDateTime2Builder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateTime2Builder';

	constructor(name: string, config: MsSqlDatetimeConfig | undefined) {
		super(name, 'object date', 'MsSqlDateTime2');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateTime2(
			table,
			this.config,
		);
	}
}

export class MsSqlDateTime2<T extends ColumnBaseConfig<'object date'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateTime2';

	readonly precision: number | undefined;

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateTime2Builder['config'],
	) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `datetime2${precision}`;
	}
}

export class MsSqlDateTime2StringBuilder extends MsSqlDateColumnBaseBuilder<{
	dataType: 'string datetime';
	data: string;
	driverParam: string | Date;
}, MsSqlDatetimeConfig> {
	static override readonly [entityKind]: string = 'MsSqlDateTime2StringBuilder';

	constructor(name: string, config: MsSqlDatetimeConfig | undefined) {
		super(name, 'string datetime', 'MsSqlDateTime2String');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDateTime2String(
			table,
			this.config,
		);
	}
}

export class MsSqlDateTime2String<T extends ColumnBaseConfig<'string datetime'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlDateTime2String';

	readonly precision: number | undefined;

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlDateTime2StringBuilder['config'],
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
export function datetime2<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTime2StringBuilder : MsSqlDateTime2Builder;
export function datetime2<TMode extends MsSqlDatetimeConfig['mode'] & {}>(
	name: string,
	config?: MsSqlDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MsSqlDateTime2StringBuilder
	: MsSqlDateTime2Builder;
export function datetime2(a?: string | MsSqlDatetimeConfig, b?: MsSqlDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new MsSqlDateTime2StringBuilder(name, config);
	}
	return new MsSqlDateTime2Builder(name, config);
}
