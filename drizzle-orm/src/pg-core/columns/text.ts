import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

type PgTextBuilderConfig<TEnum extends [string, ...string[]]> = Equal<TEnum, [string, ...string[]]> extends true
	? { dataType: 'string'; data: string; driverParam: string }
	: { dataType: 'string enum'; data: TEnum[number]; enumValues: TEnum; driverParam: string };

export class PgTextBuilder<TEnum extends [string, ...string[]] = [string, ...string[]]> extends PgColumnBuilder<
	PgTextBuilderConfig<TEnum>,
	{ enumValues: TEnum }
> {
	static override readonly [entityKind]: string = 'PgTextBuilder';

	constructor(
		name: string,
		config: PgTextConfig<TEnum>,
	) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'PgText');
		this.config.enumValues = config.enum as TEnum;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgText(table, this.config as any, this.config.enumValues);
	}
}

export class PgText<TEnum extends [string, ...string[]] = [string, ...string[]]> extends PgColumn<
	Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum'
> {
	static override readonly [entityKind]: string = 'PgText';
	override readonly enumValues;

	constructor(
		table: PgTable<any>,
		config: any,
		enumValues?: string[],
	) {
		super(table, config);
		this.enumValues = enumValues;
	}

	getSQLType(): string {
		return 'text';
	}
}

export interface PgTextConfig<
	TEnum extends readonly string[] | undefined = readonly string[] | undefined,
> {
	enum?: TEnum;
}

// Original function overloads style
export function text(): PgTextBuilder;
export function text(name: string): PgTextBuilder;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config: PgTextConfig<T | Writable<T>>,
): PgTextBuilder<Writable<T>>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config: PgTextConfig<T | Writable<T>>,
): PgTextBuilder<Writable<T>>;
export function text(a?: string | PgTextConfig, b: PgTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<PgTextConfig>(a, b);
	return new PgTextBuilder(name, config as any);
}
