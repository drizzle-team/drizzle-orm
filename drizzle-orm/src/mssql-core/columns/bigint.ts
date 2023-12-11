import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlBigIntBuilderInitial<TMode extends 'number' | 'bigint' | 'string', TName extends string> =
	MsSqlBigIntBuilder<
		{
			name: TName;
			dataType: 'bigint';
			columnType: 'MsSqlBigInt';
			data: TMode extends 'string' ? string : TMode extends 'number' ? number : bigint;
			driverParam: string;
			enumValues: undefined;
			generated: undefined;
		}
	>;

export class MsSqlBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'MsSqlBigInt'>>
	extends MsSqlColumnBuilderWithIdentity<T, MsSqlBigIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlBigIntBuilder';

	constructor(name: T['name'], config: MsSqlBigIntConfig) {
		super(name, 'bigint', 'MsSqlBigInt');
		this.config.mode = config.mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlBigInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlBigInt<T extends ColumnBaseConfig<'bigint', 'MsSqlBigInt'>>
	extends MsSqlColumnWithIdentity<T, MsSqlBigIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlBigInt';

	readonly mode: 'number' | 'bigint' | 'string' = this.config.mode;

	_getSQLType(): string {
		return `bigint`;
	}

	constructor(table: AnyMsSqlTable<{ name: T['tableName'] }>, config: MsSqlBigIntBuilder<T>['config']) {
		super(table, config);
		this.mode = config.mode;
	}

	override mapFromDriverValue(value: string): T['data'] {
		return this.mode === 'string' ? value.toString() : this.mode === 'number' ? Number(value) : BigInt(value);
	}
}

interface MsSqlBigIntConfig<T extends 'number' | 'bigint' | 'string' = 'number' | 'bigint' | 'string'> {
	mode: T;
	unsigned?: boolean;
}

export function bigint<TName extends string, TMode extends MsSqlBigIntConfig['mode']>(
	name: TName,
	config: MsSqlBigIntConfig<TMode>,
): MsSqlBigIntBuilderInitial<TMode, TName>;
export function bigint(name: string, config: MsSqlBigIntConfig) {
	return new MsSqlBigIntBuilder(name, config);
}
