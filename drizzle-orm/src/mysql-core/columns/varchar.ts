import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlVarCharBuilder<
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> extends MySqlColumnBuilder<{
	name: string;
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string varchar' : 'enum';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	length: TLength;
}, MySqlVarCharConfig<TEnum, TLength>> {
	static override readonly [entityKind]: string = 'MySqlVarCharBuilder';

	/** @internal */
	constructor(name: string, config: MySqlVarCharConfig<TEnum, TLength>) {
		super(name, config.enum?.length ? 'enum' : 'string varchar', 'MySqlVarChar');
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

export class MySqlVarChar<T extends ColumnBaseConfig<'string varchar' | 'enum'> & { length?: number | undefined }>
	extends MySqlColumn<T, MySqlVarCharConfig<T['enumValues'], T['length']>>
{
	static override readonly [entityKind]: string = 'MySqlVarChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface MySqlVarCharConfig<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length: TLength;
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config: MySqlVarCharConfig<T | Writable<T>, L>,
): MySqlVarCharBuilder<Writable<T>, L>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: string,
	config: MySqlVarCharConfig<T | Writable<T>, L>,
): MySqlVarCharBuilder<Writable<T>, L>;
export function varchar(a?: string | MySqlVarCharConfig, b?: MySqlVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<MySqlVarCharConfig>(a, b);
	return new MySqlVarCharBuilder(name, config as any);
}
