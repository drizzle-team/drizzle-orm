import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	GeneratedColumnConfig,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
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
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override generatedAlwaysAs(
		as: SQL<unknown> | (() => SQL) | T['data'],
		config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreDecimalBuilder';

	constructor(name: T['name'], config: SingleStoreDecimalConfig | undefined) {
		super(name, 'string', 'SingleStoreDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
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
	static override readonly [entityKind]: string = 'SingleStoreDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'decimal';
		} else {
			type += `decimal(${this.precision})`;
		}
		type = type === 'decimal(10,0)' || type === 'decimal(10)' ? 'decimal' : type;
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface SingleStoreDecimalConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function decimal(): SingleStoreDecimalBuilderInitial<''>;
export function decimal(
	config: SingleStoreDecimalConfig,
): SingleStoreDecimalBuilderInitial<''>;
export function decimal<TName extends string>(
	name: TName,
	config?: SingleStoreDecimalConfig,
): SingleStoreDecimalBuilderInitial<TName>;
export function decimal(a?: string | SingleStoreDecimalConfig, b: SingleStoreDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDecimalConfig>(a, b);
	return new SingleStoreDecimalBuilder(name, config);
}
