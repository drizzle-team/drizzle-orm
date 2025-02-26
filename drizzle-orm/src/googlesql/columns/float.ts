import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlFloatBuilderInitial<TName extends string> = GoogleSqlFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlFloat';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlFloat'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlFloatConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlFloatBuilder';

	constructor(name: T['name'], config: GoogleSqlFloatConfig | undefined) {
		super(name, 'number', 'GoogleSqlFloat');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlFloat<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlFloat<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GoogleSqlFloat<T extends ColumnBaseConfig<'number', 'GoogleSqlFloat'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlFloatConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlFloat';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `float(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'float';
		} else {
			type += `float(${this.precision})`;
		}
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface GoogleSqlFloatConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function float(): GoogleSqlFloatBuilderInitial<''>;
export function float(
	config?: GoogleSqlFloatConfig,
): GoogleSqlFloatBuilderInitial<''>;
export function float<TName extends string>(
	name: TName,
	config?: GoogleSqlFloatConfig,
): GoogleSqlFloatBuilderInitial<TName>;
export function float(a?: string | GoogleSqlFloatConfig, b?: GoogleSqlFloatConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlFloatConfig>(a, b);
	return new GoogleSqlFloatBuilder(name, config);
}
