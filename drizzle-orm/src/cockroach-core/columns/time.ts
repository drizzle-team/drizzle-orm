import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export type CockroachTimeBuilderInitial<TName extends string> = CockroachTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachTime';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachTime'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'CockroachTimeBuilder';

	constructor(
		name: T['name'],
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string', 'CockroachTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachTime<MakeColumnConfig<T, TTableName>> {
		return new CockroachTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachTime<T extends ColumnBaseConfig<'string', 'CockroachTime'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyCockroachTable<{ name: T['tableName'] }>, config: CockroachTimeBuilder<T>['config']) {
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

export function time(): CockroachTimeBuilderInitial<''>;
export function time(config?: TimeConfig): CockroachTimeBuilderInitial<''>;
export function time<TName extends string>(name: TName, config?: TimeConfig): CockroachTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b: TimeConfig = {}) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new CockroachTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
