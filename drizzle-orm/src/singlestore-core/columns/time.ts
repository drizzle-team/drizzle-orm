import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, GeneratedColumnConfig, HasGenerated, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';
import type { SQL } from '~/sql/index.ts';

export type SingleStoreTimeBuilderInitial<TName extends string> = SingleStoreTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreTime';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreTime'>>
	extends SingleStoreColumnBuilder<
		T,
		TimeConfig
	>
{
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override generatedAlwaysAs(as: SQL<unknown> | (() => SQL) | T['data'], config?: Partial<GeneratedColumnConfig<unknown>>): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreTimeBuilder';

	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name, 'string', 'SingleStoreTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreTime<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreTime<
	T extends ColumnBaseConfig<'string', 'SingleStoreTime'>,
> extends SingleStoreColumn<T, TimeConfig> {
	static override readonly [entityKind]: string = 'SingleStoreTime';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time(): SingleStoreTimeBuilderInitial<''>;
export function time(
	config?: TimeConfig,
): SingleStoreTimeBuilderInitial<''>;
export function time<TName extends string>(
	name: TName,
	config?: TimeConfig,
): SingleStoreTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b?: TimeConfig) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new SingleStoreTimeBuilder(name, config);
}
