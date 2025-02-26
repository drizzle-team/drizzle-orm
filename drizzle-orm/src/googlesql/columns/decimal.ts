import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlDecimalBuilderInitial<TName extends string> = GoogleSqlDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GoogleSqlDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlDecimal'>,
> extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlDecimalConfig> {
	static override readonly [entityKind]: string = 'GoogleSqlDecimalBuilder';

	constructor(name: T['name'], config: GoogleSqlDecimalConfig | undefined) {
		super(name, 'string', 'GoogleSqlDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlDecimal<T extends ColumnBaseConfig<'string', 'GoogleSqlDecimal'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'decimal';
		} else {
			type += `decimal(${this.precision})`;
		}
		type = type === 'decimal(10,0)' || type === 'decimal(10)' ? 'decimal' : type;
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface GoogleSqlDecimalConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function decimal(): GoogleSqlDecimalBuilderInitial<''>;
export function decimal(
	config: GoogleSqlDecimalConfig,
): GoogleSqlDecimalBuilderInitial<''>;
export function decimal<TName extends string>(
	name: TName,
	config?: GoogleSqlDecimalConfig,
): GoogleSqlDecimalBuilderInitial<TName>;
export function decimal(a?: string | GoogleSqlDecimalConfig, b: GoogleSqlDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlDecimalConfig>(a, b);
	return new GoogleSqlDecimalBuilder(name, config);
}
