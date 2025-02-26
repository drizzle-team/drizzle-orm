import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlRealBuilderInitial<TName extends string> = GoogleSqlRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlReal';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlReal'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<
		T,
		GoogleSqlRealConfig
	>
{
	static override readonly [entityKind]: string = 'GoogleSqlRealBuilder';

	constructor(name: T['name'], config: GoogleSqlRealConfig | undefined) {
		super(name, 'number', 'GoogleSqlReal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlReal<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GoogleSqlReal<T extends ColumnBaseConfig<'number', 'GoogleSqlReal'>> extends GoogleSqlColumnWithAutoIncrement<
	T,
	GoogleSqlRealConfig
> {
	static override readonly [entityKind]: string = 'GoogleSqlReal';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `real(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export interface GoogleSqlRealConfig {
	precision?: number;
	scale?: number;
}

export function real(): GoogleSqlRealBuilderInitial<''>;
export function real(
	config?: GoogleSqlRealConfig,
): GoogleSqlRealBuilderInitial<''>;
export function real<TName extends string>(
	name: TName,
	config?: GoogleSqlRealConfig,
): GoogleSqlRealBuilderInitial<TName>;
export function real(a?: string | GoogleSqlRealConfig, b: GoogleSqlRealConfig = {}) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlRealConfig>(a, b);
	return new GoogleSqlRealBuilder(name, config);
}
