import type {
	ColumnBuilderBaseConfig,
	HasDefault,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgSerialBuilderInitial<TName extends string> = NotNull<
	HasDefault<
		PgSerialBuilder<{
			name: TName;
			dataType: 'number';
			data: number;
			driverParam: number;
			enumValues: undefined;
		}>
	>
>;

export class PgSerialBuilder<T extends ColumnBuilderBaseConfig<'number'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgSerial(table, this.config as any);
	}
}

export class PgSerial<T extends ColumnBaseConfig<'number'>> extends PgColumn<T> {
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
