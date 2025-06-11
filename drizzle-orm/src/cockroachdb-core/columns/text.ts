import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	CockroachDbTextBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachDbText';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: string;
	}>;

export class CockroachDbTextBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbText'>,
> extends CockroachDbColumnWithArrayBuilder<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'CockroachDbTextBuilder';

	constructor(
		name: T['name'],
		config: CockroachDbTextConfig<T['enumValues']>,
	) {
		super(name, 'string', 'CockroachDbText');
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbText<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbText<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbText<T extends ColumnBaseConfig<'string', 'CockroachDbText'>>
	extends CockroachDbColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'CockroachDbText';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return 'text';
	}
}

export interface CockroachDbTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function text(): CockroachDbTextBuilderInitial<'', [string, ...string[]]>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: CockroachDbTextConfig<T | Writable<T>>,
): CockroachDbTextBuilderInitial<'', Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: CockroachDbTextConfig<T | Writable<T>>,
): CockroachDbTextBuilderInitial<TName, Writable<T>>;
export function text(a?: string | CockroachDbTextConfig, b: CockroachDbTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachDbTextConfig>(a, b);
	return new CockroachDbTextBuilder(name, config as any);
}
