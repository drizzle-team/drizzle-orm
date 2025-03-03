import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';

export type GoogleSqlIntBuilderInitial<TName extends string> = GoogleSqlIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlInt'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlIntBuilder';

	constructor(name: T['name'], config?: GoogleSqlIntConfig) {
		super(name, 'number', 'GoogleSqlInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlInt<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlInt<T extends ColumnBaseConfig<'number', 'GoogleSqlInt'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlInt';

	getSQLType(): string {
		return `int${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export interface GoogleSqlIntConfig {
	unsigned?: boolean;
}

export function int(): GoogleSqlIntBuilderInitial<''>;
export function int(
	config?: GoogleSqlIntConfig,
): GoogleSqlIntBuilderInitial<''>;
export function int<TName extends string>(
	name: TName,
	config?: GoogleSqlIntConfig,
): GoogleSqlIntBuilderInitial<TName>;
export function int(a?: string | GoogleSqlIntConfig, b?: GoogleSqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlIntConfig>(a, b);
	return new GoogleSqlIntBuilder(name, config);
}
