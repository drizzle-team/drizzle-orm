import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export interface SurrealDBCustomColumnInnerConfig {
	customTypeValues: CustomTypeValues;
}

export interface CustomTypeValues {
	data: unknown;
	driverData: unknown;
	dataType: string;
	config: Record<string, unknown>;
}

export interface SurrealDBCustomColumnConfig<T extends CustomTypeValues> {
	dataType(): string;
	toDriver?(value: T['data']): T['driverData'];
	fromDriver?(value: T['driverData']): T['data'];
}

export class SurrealDBCustomColumnBuilder<T extends ColumnBuilderBaseConfig<any, any>>
	extends SurrealDBColumnBuilder<T, { fieldConfig: SurrealDBCustomColumnConfig<any> }>
{
	static override readonly [entityKind]: string = 'SurrealDBCustomColumnBuilder';

	constructor(
		name: T['name'],
		fieldConfig: SurrealDBCustomColumnConfig<any>,
		customTypeValues: CustomTypeValues,
	) {
		super(name, customTypeValues.dataType as any, 'SurrealDBCustomColumn' as any);
		this.config.fieldConfig = fieldConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBCustomColumn<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBCustomColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBCustomColumn<T extends ColumnBaseConfig<any, any>>
	extends SurrealDBColumn<T, { fieldConfig: SurrealDBCustomColumnConfig<any> }>
{
	static override readonly [entityKind]: string = 'SurrealDBCustomColumn';

	private sqlType: string;
	declare protected mapFrom: ((value: T['driverParam']) => T['data']) | undefined;
	declare protected mapTo: ((value: T['data']) => T['driverParam']) | undefined;

	constructor(
		table: SurrealDBColumn['table'],
		config: SurrealDBCustomColumn<T>['config'],
	) {
		super(table, config);
		this.sqlType = config.fieldConfig.dataType();
		this.mapFrom = config.fieldConfig.fromDriver;
		this.mapTo = config.fieldConfig.toDriver;
	}

	getSQLType(): string {
		return this.sqlType;
	}

	override mapFromDriverValue(value: T['driverParam']): T['data'] {
		return typeof this.mapFrom === 'function' ? this.mapFrom(value) : value;
	}

	override mapToDriverValue(value: T['data']): T['driverParam'] {
		return typeof this.mapTo === 'function' ? this.mapTo(value) : value;
	}
}

export function customType<T extends CustomTypeValues>(
	customTypeParams: SurrealDBCustomColumnConfig<T>,
): (...args: any[]) => SurrealDBCustomColumnBuilder<any> {
	return (name?: string) => {
		return new SurrealDBCustomColumnBuilder(
			name ?? '',
			customTypeParams,
			{} as any,
		);
	};
}
