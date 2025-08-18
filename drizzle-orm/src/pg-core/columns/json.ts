import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgJsonBuilder extends PgColumnBuilder<
	{
		name: string;
		dataType: 'object json';
		data: unknown;
		driverParam: unknown;
		enumValues: undefined;
	}
> {
	static override readonly [entityKind]: string = 'PgJsonBuilder';

	constructor(name: string) {
		super(name, 'object json', 'PgJson');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgJson(table, this.config as any);
	}
}

export class PgJson<T extends ColumnBaseConfig<'object json'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgJson';

	constructor(table: PgTable<any>, config: PgJsonBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'json';
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

export function json(name?: string): PgJsonBuilder {
	return new PgJsonBuilder(name ?? '');
}
