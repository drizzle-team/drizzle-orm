import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreVarCharBuilder<
	TEnum extends [string, ...string[]],
> extends SingleStoreColumnBuilder<{
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
}, SingleStoreVarCharConfig<TEnum>> {
	static override readonly [entityKind]: string = 'SingleStoreVarCharBuilder';

	/** @internal */
	constructor(name: string, config: SingleStoreVarCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'SingleStoreVarChar');
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
	T extends ColumnBaseConfig<'string' | 'string enum'> & { length: number },
> extends SingleStoreColumn<T, SingleStoreVarCharConfig<T['enumValues']>> {
	static override readonly [entityKind]: string = 'SingleStoreVarChar';

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface SingleStoreVarCharConfig<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
> {
	enum?: TEnum;
	length: number;
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: SingleStoreVarCharConfig<T | Writable<T>>,
): SingleStoreVarCharBuilder<Writable<T>>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config: SingleStoreVarCharConfig<T | Writable<T>>,
): SingleStoreVarCharBuilder<Writable<T>>;
export function varchar(a?: string | SingleStoreVarCharConfig, b?: SingleStoreVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarCharConfig>(a, b);
	return new SingleStoreVarCharBuilder(name, config as any);
}
