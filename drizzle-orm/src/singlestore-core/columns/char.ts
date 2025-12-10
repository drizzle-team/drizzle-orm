import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreCharBuilder<
	TEnum extends [string, ...string[]],
> extends SingleStoreColumnBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
	},
	{ enum?: TEnum; length: number; setLength: boolean }
> {
	static override readonly [entityKind]: string = 'SingleStoreCharBuilder';

	constructor(name: string, config: SingleStoreCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'SingleStoreChar');
		this.config.length = config.length ?? 1;
		this.config.setLength = config.length !== undefined;
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

export class SingleStoreChar<
	T extends ColumnBaseConfig<'string' | 'string enum'>,
> extends SingleStoreColumn<T, { enum?: T['enumValues']; length: number; setLength: boolean }> {
	static override readonly [entityKind]: string = 'SingleStoreChar';

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.config.setLength ? `char(${this.length})` : `char`;
	}
}

export interface SingleStoreCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number;
}

export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: SingleStoreCharConfig<T | Writable<T>>,
): SingleStoreCharBuilder<Writable<T>>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: SingleStoreCharConfig<T | Writable<T>>,
): SingleStoreCharBuilder<Writable<T>>;
export function char(a?: string | SingleStoreCharConfig, b: SingleStoreCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreCharConfig>(a, b);
	return new SingleStoreCharBuilder(name, config as any);
}
