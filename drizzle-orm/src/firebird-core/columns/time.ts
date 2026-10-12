import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { FirebirdColumn } from './common.ts';
import { FirebirdDateColumnBaseBuilder } from './date.common.ts';
import type { Precision } from './timestamp.ts';

export type FirebirdTimeBuilderInitial<TName extends string> = FirebirdTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdTime';
	data: string;
	driverParam: Date | string;
	enumValues: undefined;
}>;

export class FirebirdTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'FirebirdTime'>>
	extends FirebirdDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'FirebirdTimeBuilder';

	constructor(
		name: T['name'],
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string', 'FirebirdTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdTime<MakeColumnConfig<T, TTableName>> {
		return new FirebirdTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdTime<T extends ColumnBaseConfig<'string', 'FirebirdTime'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdTimeBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		return `time${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		const hours = String(value.getHours()).padStart(2, '0');
		const minutes = String(value.getMinutes()).padStart(2, '0');
		const seconds = String(value.getSeconds()).padStart(2, '0');
		const fraction = String(value.getMilliseconds()).padStart(3, '0');

		return `${hours}:${minutes}:${seconds}.${fraction}0`;
	}

	override mapToDriverValue(value: string): Date | string {
		const match = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,4}))?$/.exec(value);
		if (!match) return value;

		const [, hours, minutes, seconds, fraction = '0'] = match;
		return new Date(
			1970,
			0,
			1,
			Number(hours),
			Number(minutes),
			Number(seconds),
			Number(fraction.padEnd(3, '0').slice(0, 3)),
		);
	}
}

export interface TimeConfig {
	precision?: Precision;
	withTimezone?: boolean;
}

export function time(): FirebirdTimeBuilderInitial<''>;
export function time(config?: TimeConfig): FirebirdTimeBuilderInitial<''>;
export function time<TName extends string>(name: TName, config?: TimeConfig): FirebirdTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b: TimeConfig = {}) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new FirebirdTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
