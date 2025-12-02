import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlBinaryBuilder extends MsSqlColumnBuilder<
	{
		dataType: 'object buffer';
		data: Buffer;
		driverParam: Buffer;
	},
	MsSqlBinaryConfig & {
		setLength: boolean;
	}
> {
	static override readonly [entityKind]: string = 'MsSqlBinaryBuilder';

	constructor(name: string, length: number | undefined) {
		super(name, 'object buffer', 'MsSqlBinary');
		this.config.length = length ?? 1;
		this.config.setLength = length !== undefined;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlBinary(table, this.config);
	}
}

export class MsSqlBinary<T extends ColumnBaseConfig<'object buffer'>> extends MsSqlColumn<
	T,
	MsSqlBinaryConfig & { setLength: boolean }
> {
	static override readonly [entityKind]: string = 'MsSqlBinary';

	getSQLType(): string {
		return this.config.setLength ? `binary(${this.length})` : `binary`;
	}
}

export interface MsSqlBinaryConfig {
	length?: number;
}

export function binary(
	config?: MsSqlBinaryConfig,
): MsSqlBinaryBuilder;
export function binary(
	name: string,
	config?: MsSqlBinaryConfig,
): MsSqlBinaryBuilder;
export function binary(a?: string | MsSqlBinaryConfig, b: MsSqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MsSqlBinaryConfig>(a, b);
	return new MsSqlBinaryBuilder(name, config.length);
}
