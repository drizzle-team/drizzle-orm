import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlVarBinaryBuilder extends MsSqlColumnBuilder<{
	dataType: 'object buffer';
	data: Buffer;
	driverParam: Buffer;
}, MsSqlVarbinaryOptions & { rawLength: MsSqlVarbinaryOptions['length'] | undefined }> {
	static override readonly [entityKind]: string = 'MsSqlVarBinaryBuilder';

	/** @internal */
	constructor(name: string, config?: MsSqlVarbinaryOptions) {
		super(name, 'object buffer', 'MsSqlVarBinary');
		this.config.length = typeof config?.length === 'number' ? config.length : config?.length === 'max' ? 2147483647 : 1;
		this.config.rawLength = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlVarBinary(
			table,
			this.config,
		);
	}
}

export class MsSqlVarBinary<
	T extends ColumnBaseConfig<'object buffer'>,
> extends MsSqlColumn<T, MsSqlVarbinaryOptions & { rawLength: MsSqlVarbinaryOptions['length'] | undefined }> {
	static override readonly [entityKind]: string = 'MsSqlVarBinary';

	getSQLType(): string {
		return this.config.rawLength === undefined ? `varbinary` : `varbinary(${this.config.rawLength})`;
	}
}

export interface MsSqlVarbinaryOptions {
	length: number | 'max';
}

export function varbinary(
	config?: MsSqlVarbinaryOptions,
): MsSqlVarBinaryBuilder;
export function varbinary(
	name: string,
	config?: MsSqlVarbinaryOptions,
): MsSqlVarBinaryBuilder;
export function varbinary(a?: string | MsSqlVarbinaryOptions, b?: MsSqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<MsSqlVarbinaryOptions>(a, b);
	return new MsSqlVarBinaryBuilder(name, config);
}
