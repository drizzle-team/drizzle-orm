import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreCharBuilder<
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> extends SingleStoreColumnBuilder<
	{
		name: string;
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'enum';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;

		length: TLength;
	},
	SingleStoreCharConfig<TEnum, TLength>
> {
	static override readonly [entityKind]: string = 'SingleStoreCharBuilder';

	constructor(name: string, config: SingleStoreCharConfig<TEnum, TLength>) {
		super(name, config.enum?.length ? 'enum' : 'string', 'SingleStoreChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreChar(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreChar<T extends ColumnBaseConfig<'string' | 'enum'> & { length?: number | undefined }>
	extends SingleStoreColumn<T, SingleStoreCharConfig<T['enumValues'], T['length']>>
{
	static override readonly [entityKind]: string = 'SingleStoreChar';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface SingleStoreCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: SingleStoreCharConfig<T | Writable<T>, L>,
): SingleStoreCharBuilder<Writable<T>, L>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: string,
	config?: SingleStoreCharConfig<T | Writable<T>, L>,
): SingleStoreCharBuilder<Writable<T>, L>;
export function char(a?: string | SingleStoreCharConfig, b: SingleStoreCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreCharConfig>(a, b);
	return new SingleStoreCharBuilder(name, config as any);
}
