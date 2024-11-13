import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	HasDefault,
	MakeColumnConfig,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgSerialBuilderInitial<TName extends string> = NotNull<
	HasDefault<
		PgSerialBuilder<{
			name: TName;
			dataType: 'number';
			columnType: 'PgSerial';
			data: number;
			driverParam: number;
			enumValues: undefined;
		}>
	>
>;

export class PgSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgSerial'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSerial<MakeColumnConfig<T, TTableName>> {
		return new PgSerial<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgSerial<T extends ColumnBaseConfig<'number', 'PgSerial'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function serial(): PgSerialBuilderInitial<''>;
export function serial<TName extends string>(name: TName): PgSerialBuilderInitial<TName>;
export function serial(name?: string) {
	return new PgSerialBuilder(name ?? '');
}
