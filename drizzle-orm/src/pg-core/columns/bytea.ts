import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgByteaBuilder extends PgColumnBuilder<{
	dataType: 'object buffer';
	data: Buffer;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'PgByteaBuilder';

	constructor(name: string) {
		super(name, 'object buffer', 'PgBytea');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBytea(table, this.config as any);
	}
}

export class PgBytea extends PgColumn<'object buffer'> {
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

export function bytea(name?: string): PgByteaBuilder {
	return new PgByteaBuilder(name ?? '');
}
