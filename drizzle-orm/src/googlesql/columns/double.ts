import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlDoubleBuilderInitial<TName extends string> = GoogleSqlDoubleBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlDouble';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlDoubleBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlDouble'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlDoubleConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlDoubleBuilder';

	constructor(name: T['name'], config: GoogleSqlDoubleConfig | undefined) {
		super(name, 'number', 'GoogleSqlDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDouble<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDouble<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlDouble<T extends ColumnBaseConfig<'number', 'GoogleSqlDouble'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlDoubleConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlDouble';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `double(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'double';
		} else {
			type += `double(${this.precision})`;
		}
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface GoogleSqlDoubleConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function double(): GoogleSqlDoubleBuilderInitial<''>;
export function double(
	config?: GoogleSqlDoubleConfig,
): GoogleSqlDoubleBuilderInitial<''>;
export function double<TName extends string>(
	name: TName,
	config?: GoogleSqlDoubleConfig,
): GoogleSqlDoubleBuilderInitial<TName>;
export function double(a?: string | GoogleSqlDoubleConfig, b?: GoogleSqlDoubleConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlDoubleConfig>(a, b);
	return new GoogleSqlDoubleBuilder(name, config);
}
