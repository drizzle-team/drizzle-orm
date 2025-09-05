import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlBigIntBuilder<TMode extends 'number' | 'bigint' | 'string'> extends MsSqlColumnBuilderWithIdentity<{
	dataType: TMode extends 'string' ? 'string int64' : TMode extends 'number' ? 'number int53' : 'bigint int64';
	data: TMode extends 'string' ? string : TMode extends 'number' ? number : bigint;
	driverParam: string;
}, MsSqlBigIntConfig> {
	static override readonly [entityKind]: string = 'MsSqlBigIntBuilder';

	constructor(name: string, config: MsSqlBigIntConfig) {
		const { mode } = config;
		super(
			name,
			mode === 'string' ? 'string int64' : mode === 'number' ? 'number int53' : 'bigint int64' as any,
			mode === 'string' ? 'MsSqlBigIntString' : mode === 'number' ? 'MsSqlBigIntNumber' : 'MsSqlBigInt',
		);
		this.config.mode = mode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlBigInt(
			table,
			this.config,
		);
	}
}

export class MsSqlBigInt<T extends ColumnBaseConfig<'bigint int64' | 'number int53' | 'string int64'>>
	extends MsSqlColumnWithIdentity<T, MsSqlBigIntConfig>
{
	static override readonly [entityKind]: string = 'MsSqlBigInt';

	readonly mode: 'number' | 'bigint' | 'string' = this.config.mode;

	getSQLType(): string {
		return `bigint`;
	}

	constructor(table: MsSqlTable<any>, config: MsSqlBigIntBuilder<'string' | 'number' | 'bigint'>['config']) {
		super(table, config);
		this.mode = config.mode;
	}

	override mapFromDriverValue(value: string): T['data'] {
		return this.mode === 'string' ? value.toString() : this.mode === 'number' ? Number(value) : BigInt(value);
	}
}

interface MsSqlBigIntConfig<T extends 'number' | 'bigint' | 'string' = 'number' | 'bigint' | 'string'> {
	mode: T;
}

export function bigint<TMode extends 'number' | 'bigint' | 'string'>(
	config: MsSqlBigIntConfig<TMode>,
): MsSqlBigIntBuilder<TMode>;
export function bigint<TMode extends 'number' | 'bigint' | 'string'>(
	name: string,
	config: MsSqlBigIntConfig<TMode>,
): MsSqlBigIntBuilder<TMode>;
export function bigint(a: string | MsSqlBigIntConfig, b?: MsSqlBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlBigIntConfig>(a, b);
	return new MsSqlBigIntBuilder(name, config);
}
