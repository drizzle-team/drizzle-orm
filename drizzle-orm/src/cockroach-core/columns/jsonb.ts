import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnBuilder } from './common.ts';

export class CockroachJsonbBuilder extends CockroachColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'CockroachJsonbBuilder';

	constructor(name: string) {
		super(name, 'object json', 'CockroachJsonb');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachJsonb(
			table,
			this.config,
		);
	}
}

export class CockroachJsonb<T extends ColumnBaseConfig<'object json'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachJsonb';

	constructor(table: CockroachTable<any>, config: CockroachJsonbBuilder['config']) {
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

export function jsonb(name?: string) {
	return new CockroachJsonbBuilder(name ?? '');
}
