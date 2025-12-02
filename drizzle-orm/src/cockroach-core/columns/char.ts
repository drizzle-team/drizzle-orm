import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachCharBuilder<
	TEnum extends [string, ...string[]],
> extends CockroachColumnWithArrayBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: string;
	},
	{ enumValues: TEnum | undefined; length: number; setLength: boolean }
> {
	static override readonly [entityKind]: string = 'CockroachCharBuilder';

	constructor(name: string, config: CockroachCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'CockroachChar');
		this.config.enumValues = config.enum;
		this.config.length = config.length ?? 1;
		this.config.setLength = config.length !== undefined;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachChar(
			table,
			this.config,
		);
	}
}

export class CockroachChar<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends CockroachColumn<T, { enumValues: T['enumValues']; setLength: boolean }>
{
	static override readonly [entityKind]: string = 'CockroachChar';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.config.setLength ? `char(${this.length})` : `char`;
	}
}

export interface CockroachCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number | undefined;
}

export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: CockroachCharConfig<T | Writable<T>>,
): CockroachCharBuilder<Writable<T>>;
export function char<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: CockroachCharConfig<T | Writable<T>>,
): CockroachCharBuilder<Writable<T>>;
export function char(a?: string | CockroachCharConfig, b: CockroachCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachCharConfig>(a, b);
	return new CockroachCharBuilder(name, config as any);
}
