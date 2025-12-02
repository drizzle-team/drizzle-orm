import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlStringBaseColumn, MySqlStringColumnBaseBuilder } from './string.common.ts';

export class MySqlCharBuilder<
	TEnum extends [string, ...string[]],
> extends MySqlStringColumnBaseBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
	},
	{ enum?: TEnum; length: number; setLength: boolean }
> {
	static override readonly [entityKind]: string = 'MySqlCharBuilder';

	constructor(name: string, config: MySqlCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'MySqlChar');
		this.config.length = (config.length ?? 1) as number;
		this.config.setLength = config.length !== undefined;
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

export class MySqlChar<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends MySqlStringBaseColumn<T, { enum?: T['enumValues']; length: number; setLength: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlChar';

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.config.setLength ? `char(${this.length})` : `char`;
	}
}

export interface MySqlCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number;
}

export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MySqlCharConfig<T | Writable<T>>,
): MySqlCharBuilder<Writable<T>>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: MySqlCharConfig<T | Writable<T>>,
): MySqlCharBuilder<Writable<T>>;
export function char(a?: string | MySqlCharConfig, b: MySqlCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlCharConfig>(a, b);
	return new MySqlCharBuilder(name, config as any);
}
