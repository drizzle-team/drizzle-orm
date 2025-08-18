import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreVarCharBuilder<
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> extends SingleStoreColumnBuilder<{
	name: string;
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string varchar' : 'string enum';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;

	length: TLength;
}, SingleStoreVarCharConfig<TEnum, TLength>> {
	static override readonly [entityKind]: string = 'SingleStoreVarCharBuilder';

	/** @internal */
	constructor(name: string, config: SingleStoreVarCharConfig<TEnum, TLength>) {
		super(name, config.enum?.length ? 'string enum' : 'string varchar', 'SingleStoreVarChar');
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
	T extends ColumnBaseConfig<'string varchar' | 'string enum'> & { length?: number | undefined },
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
): SingleStoreVarCharBuilder<Writable<T>, L>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: string,
	config: SingleStoreVarCharConfig<T | Writable<T>, L>,
): SingleStoreVarCharBuilder<Writable<T>, L>;
export function varchar(a?: string | SingleStoreVarCharConfig, b?: SingleStoreVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreVarCharConfig>(a, b);
	return new SingleStoreVarCharBuilder(name, config as any);
}
