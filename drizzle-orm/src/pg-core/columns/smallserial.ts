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

export type PgSmallSerialBuilderInitial<TName extends string> = NotNull<
	HasDefault<
		PgSmallSerialBuilder<{
			name: TName;
			dataType: 'number';
			columnType: 'PgSmallSerial';
			data: number;
			driverParam: number;
			enumValues: undefined;
		}>
	>
>;

export class PgSmallSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgSmallSerial'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgSmallSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgSmallSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSmallSerial<MakeColumnConfig<T, TTableName>> {
		return new PgSmallSerial<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgSmallSerial<T extends ColumnBaseConfig<'number', 'PgSmallSerial'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgSmallSerial';

	getSQLType(): string {
		return 'smallserial';
	}
}

export function smallserial(): PgSmallSerialBuilderInitial<''>;
export function smallserial<TName extends string>(name: TName): PgSmallSerialBuilderInitial<TName>;
export function smallserial(name?: string) {
	return new PgSmallSerialBuilder(name ?? '');
}
