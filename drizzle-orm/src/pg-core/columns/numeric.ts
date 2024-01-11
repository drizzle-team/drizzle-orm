import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgNumericBuilderInitial<TName extends string> = PgNumericBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'PgNumeric';
		data: string;
		driverParam: string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class PgNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgNumeric'>> extends PgColumnBuilder<
	T,
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	static readonly [entityKind]: string = 'PgNumericBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'string', 'PgNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgNumeric<MakeColumnConfig<T, TTableName>> {
		return new PgNumeric<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgNumeric<T extends ColumnBaseConfig<'string', 'PgNumeric'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgNumericBuilder<T>['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export function numeric<TName extends string>(
	name: TName,
	config?:
		| { precision: number; scale?: number }
		| { precision?: number; scale: number }
		| { precision: number; scale: number },
): PgNumericBuilderInitial<TName> {
	return new PgNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
