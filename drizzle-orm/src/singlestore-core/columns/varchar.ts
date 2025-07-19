import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreVarCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = SingleStoreVarCharBuilder<
	{
		name: TName;
		dataType: 'string';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		generated: undefined;
		length: TLength;
	}
>;

export class SingleStoreVarCharBuilder<
	T extends ColumnBuilderBaseConfig<'string'> & { length?: number | undefined },
> extends SingleStoreColumnBuilder<T, SingleStoreVarCharConfig<T['enumValues'], T['length']>> {
	static override readonly [entityKind]: string = 'SingleStoreVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: SingleStoreVarCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'SingleStoreVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreVarChar(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreVarChar<
	T extends ColumnBaseConfig<'string'> & { length?: number | undefined },
> extends SingleStoreColumn<T, SingleStoreVarCharConfig<T['enumValues'], T['length']>> {
	static override readonly [entityKind]: string = 'SingleStoreVarChar';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface SingleStoreVarCharConfig<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length: TLength;
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config: SingleStoreVarCharConfig<T | Writable<T>, L>,
): SingleStoreVarCharBuilderInitial<'', Writable<T>, L>;
export function varchar<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config: SingleStoreVarCharConfig<T | Writable<T>, L>,
): SingleStoreVarCharBuilderInitial<TName, Writable<T>, L>;
export function varchar(a?: string | SingleStoreVarCharConfig, b?: SingleStoreVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarCharConfig>(a, b);
	return new SingleStoreVarCharBuilder(name, config as any);
}
