import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type {  PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgByteaBuilderInitial<TName extends string> = PgByteaBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'PgBytea';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class PgByteaBuilder<T extends ColumnBuilderBaseConfig<'buffer'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgByteaBuilder';

	constructor(name: T['name']) {
		super(name, 'buffer', 'PgBytea');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgBytea(table, this.config as any);
	}
}

export class PgBytea<T extends ColumnBaseConfig<'buffer'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBytea';

	override mapFromDriverValue(value: Buffer | Uint8Array | string): Buffer {
		if (Buffer.isBuffer(value)) return value;

		if (typeof value === 'string') {
			// Remove '\x'
			const trimmed = value.slice(2, value.length);
			return Buffer.from(trimmed, 'hex');
		}

		return Buffer.from(value);
	}

	getSQLType(): string {
		return 'bytea';
	}
}

export function bytea(): PgByteaBuilderInitial<''>;
export function bytea<TName extends string>(name: TName): PgByteaBuilderInitial<TName>;
export function bytea(name?: string) {
	return new PgByteaBuilder(name ?? '');
}
