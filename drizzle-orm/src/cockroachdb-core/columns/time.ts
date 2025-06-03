import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export type CockroachDbTimeBuilderInitial<TName extends string> = CockroachDbTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbTime';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDbTime'>>
	extends CockroachDbColumnWithArrayBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'CockroachDbTimeBuilder';

	constructor(
		name: T['name'],
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string', 'CockroachDbTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbTime<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbTime<T extends ColumnBaseConfig<'string', 'CockroachDbTime'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyCockroachDbTable<{ name: T['tableName'] }>, config: CockroachDbTimeBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `time${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export interface TimeConfig {
	precision?: Precision;
	withTimezone?: boolean;
}

export function time(): CockroachDbTimeBuilderInitial<''>;
export function time(config?: TimeConfig): CockroachDbTimeBuilderInitial<''>;
export function time<TName extends string>(name: TName, config?: TimeConfig): CockroachDbTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b: TimeConfig = {}) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new CockroachDbTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
