import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachVarcharBuilder<
	TEnum extends [string, ...string[]],
> extends CockroachColumnWithArrayBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	},
	{ length: number | undefined; enumValues: TEnum | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachVarcharBuilder';

	constructor(name: string, config: CockroachVarcharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'CockroachVarchar');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachVarchar(
			table,
			this.config,
		);
	}
}

export class CockroachVarchar<
	T extends ColumnBaseConfig<'string' | 'string enum'>,
> extends CockroachColumn<T, { length: number | undefined; enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'CockroachVarchar';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface CockroachVarcharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number | undefined;
}

export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: CockroachVarcharConfig<T | Writable<T>>,
): CockroachVarcharBuilder<Writable<T>>;
export function varchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: CockroachVarcharConfig<T | Writable<T>>,
): CockroachVarcharBuilder<Writable<T>>;
export function varchar(a?: string | CockroachVarcharConfig, b: CockroachVarcharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachVarcharConfig>(a, b);
	return new CockroachVarcharBuilder(name, config as any);
}
