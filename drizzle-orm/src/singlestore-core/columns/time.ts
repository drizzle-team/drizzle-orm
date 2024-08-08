import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

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
	static readonly [entityKind]: string = 'SingleStoreTimeBuilder';

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
	static readonly [entityKind]: string = 'SingleStoreTime';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time<TName extends string>(name: TName, config?: TimeConfig): SingleStoreTimeBuilderInitial<TName> {
	return new SingleStoreTimeBuilder(name, config);
}
