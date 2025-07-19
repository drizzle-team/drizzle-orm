import type {
	ColumnBuilderBaseConfig,
	HasDefault,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgSmallSerialBuilderInitial<TName extends string> = NotNull<
	HasDefault<
		PgSmallSerialBuilder<{
			name: TName;
			dataType: 'number';
			data: number;
			driverParam: number;
			enumValues: undefined;
		}>
	>
>;

export class PgSmallSerialBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgSmallSerialBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgSmallSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgSmallSerial(
			table,
			this.config as any,
		);
	}
}

export class PgSmallSerial<T extends ColumnBaseConfig<'number'>> extends PgColumn<T> {
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
