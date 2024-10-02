import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreDecimalBuilderInitial<TName extends string> = SingleStoreDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'SingleStoreDecimal'>,
> extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreDecimalConfig> {
	static readonly [entityKind]: string = 'SingleStoreDecimalBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'SingleStoreDecimal');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDecimal<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDecimal<T extends ColumnBaseConfig<'string', 'SingleStoreDecimal'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreDecimalConfig>
{
	static readonly [entityKind]: string = 'SingleStoreDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export interface SingleStoreDecimalConfig {
	precision?: number;
	scale?: number;
}

export function decimal<TName extends string>(
	name: TName,
	config: SingleStoreDecimalConfig = {},
): SingleStoreDecimalBuilderInitial<TName> {
	return new SingleStoreDecimalBuilder(name, config.precision, config.scale);
}
