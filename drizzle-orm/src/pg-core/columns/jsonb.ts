import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgJsonbBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'object json';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgJsonbBuilder';

	constructor(name: string) {
		super(name, 'object json', 'PgJsonb');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgJsonb(table, this.config as any);
	}
}

export class PgJsonb<T extends ColumnBaseConfig<'object json'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgJsonb';

	constructor(table: PgTable<any>, config: PgJsonbBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: T['data'] | string): T['data'] {
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch {
				return value as T['data'];
			}
		}
		return value;
	}
}

export function jsonb(name?: string): PgJsonbBuilder {
	return new PgJsonbBuilder(name ?? '');
}
