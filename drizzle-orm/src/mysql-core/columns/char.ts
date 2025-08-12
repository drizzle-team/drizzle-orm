import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlCharBuilder<
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> extends MySqlColumnBuilder<
	{
		name: string;
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'enum';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		length: TLength;
	},
	MySqlCharConfig<TEnum, TLength>
> {
	static override readonly [entityKind]: string = 'MySqlCharBuilder';

	constructor(name: string, config: MySqlCharConfig<TEnum, TLength>) {
		super(name, config.enum?.length ? 'enum' : 'string', 'MySqlChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlChar(
			table,
			this.config as any,
		);
	}
}

export class MySqlChar<T extends ColumnBaseConfig<'string' | 'enum'> & { length?: number | undefined }>
	extends MySqlColumn<T, MySqlCharConfig<T['enumValues'], T['length']>>
{
	static override readonly [entityKind]: string = 'MySqlChar';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface MySqlCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: MySqlCharConfig<T | Writable<T>, L>,
): MySqlCharBuilder<Writable<T>, L>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: string,
	config?: MySqlCharConfig<T | Writable<T>, L>,
): MySqlCharBuilder<Writable<T>, L>;
export function char(a?: string | MySqlCharConfig, b: MySqlCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlCharConfig>(a, b);
	return new MySqlCharBuilder(name, config as any);
}
