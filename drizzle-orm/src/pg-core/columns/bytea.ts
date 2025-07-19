import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type {  PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgByteaBuilder<TName extends string> extends PgColumnBuilder<{
	name: TName;
	dataType: 'buffer';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgByteaBuilder';

	constructor(name: string) {
		super(name, 'buffer', 'PgBytea');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgBytea(table, this.config as any);
	}
}

export class PgBytea extends PgColumn<ColumnBaseConfig<'buffer'>> {
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

export function bytea(): PgByteaBuilder<''>;
export function bytea<TName extends string>(name: TName): PgByteaBuilder<TName>;
export function bytea(name?: string) {
	return new PgByteaBuilder(name ?? '');
}
