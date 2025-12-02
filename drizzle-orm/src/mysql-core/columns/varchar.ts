import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlStringBaseColumn, MySqlStringColumnBaseBuilder } from './string.common.ts';

export class MySqlVarCharBuilder<
	TEnum extends [string, ...string[]],
> extends MySqlStringColumnBaseBuilder<{
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
}, MySqlVarCharConfig<TEnum>> {
	static override readonly [entityKind]: string = 'MySqlVarCharBuilder';

	/** @internal */
	constructor(name: string, config: MySqlVarCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'MySqlVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlVarChar(
			table,
			this.config as any,
		);
	}
}

export class MySqlVarChar<
	T extends ColumnBaseConfig<'string' | 'string enum'> & { length: number },
> extends MySqlStringBaseColumn<T, MySqlVarCharConfig<T['enumValues']>> {
	static override readonly [entityKind]: string = 'MySqlVarChar';

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return `varchar(${this.length})`;
	}
}

export interface MySqlVarCharConfig<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
> {
	enum?: TEnum;
	length: number;
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: MySqlVarCharConfig<T | Writable<T>>,
): MySqlVarCharBuilder<Writable<T>>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config: MySqlVarCharConfig<T | Writable<T>>,
): MySqlVarCharBuilder<Writable<T>>;
export function varchar(a: string | MySqlVarCharConfig, b?: MySqlVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<MySqlVarCharConfig>(a, b);
	return new MySqlVarCharBuilder(name, config as any);
}
