import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/tables/common.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreDoubleBuilderInitial<TName extends string> = SingleStoreDoubleBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreDouble';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDoubleBuilder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreDouble'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreDoubleConfig>
{
	static readonly [entityKind]: string = 'SingleStoreDoubleBuilder';

	constructor(name: T['name'], config: SingleStoreDoubleConfig | undefined) {
		super(name, 'number', 'SingleStoreDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDouble<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDouble<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDouble<T extends ColumnBaseConfig<'number', 'SingleStoreDouble'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreDoubleConfig>
{
	static readonly [entityKind]: string = 'SingleStoreDouble';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `double(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'double';
		} else {
			return `double(${this.precision})`;
		}
	}
}

export interface SingleStoreDoubleConfig {
	precision?: number;
	scale?: number;
}

export function double<TName extends string>(
	name: TName,
	config?: SingleStoreDoubleConfig,
): SingleStoreDoubleBuilderInitial<TName> {
	return new SingleStoreDoubleBuilder(name, config);
}
