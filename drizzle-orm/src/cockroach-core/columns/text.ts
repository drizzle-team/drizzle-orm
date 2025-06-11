import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	CockroachTextBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'CockroachText';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: string;
	}>;

export class CockroachTextBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachText'>,
> extends CockroachColumnWithArrayBuilder<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'CockroachTextBuilder';

	constructor(
		name: T['name'],
		config: CockroachTextConfig<T['enumValues']>,
	) {
		super(name, 'string', 'CockroachText');
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachText<MakeColumnConfig<T, TTableName>> {
		return new CockroachText<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachText<T extends ColumnBaseConfig<'string', 'CockroachText'>>
	extends CockroachColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'CockroachText';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return 'text';
	}
}

export interface CockroachTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function text(): CockroachTextBuilderInitial<'', [string, ...string[]]>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: CockroachTextConfig<T | Writable<T>>,
): CockroachTextBuilderInitial<'', Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: CockroachTextConfig<T | Writable<T>>,
): CockroachTextBuilderInitial<TName, Writable<T>>;
export function text(a?: string | CockroachTextConfig, b: CockroachTextConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachTextConfig>(a, b);
	return new CockroachTextBuilder(name, config as any);
}
