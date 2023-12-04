import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlRealBuilderInitial<TName extends string> = MsSqlRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlReal';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlReal'>>
	extends MsSqlColumnBuilderWithIdentity<
		T,
		MsSqlRealConfig
	>
{
	static readonly [entityKind]: string = 'MsSqlRealBuilder';

	constructor(name: T['name'], config: MsSqlRealConfig | undefined) {
		super(name, 'number', 'MsSqlReal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlReal<MakeColumnConfig<T, TTableName>> {
		return new MsSqlReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlReal<T extends ColumnBaseConfig<'number', 'MsSqlReal'>> extends MsSqlColumnWithIdentity<
	T,
	MsSqlRealConfig
> {
	static readonly [entityKind]: string = 'MsSqlReal';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	_getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `real(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export interface MsSqlRealConfig {
	precision?: number;
	scale?: number;
}

export function real<TName extends string>(name: TName, config: MsSqlRealConfig = {}): MsSqlRealBuilderInitial<TName> {
	return new MsSqlRealBuilder(name, config);
}
