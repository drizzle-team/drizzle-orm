import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import {
	CockroachColumn,
	type CockroachColumnBaseConfig,
	CockroachColumnBuilder,
	type CockroachColumnBuilderRuntimeConfig,
} from './common.ts';

export class CockroachJsonbBuilder extends CockroachColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'CockroachJsonbBuilder';

	constructor(name: string) {
		super(name, 'object json', 'CockroachJsonb');
	}

	/**
	 * @throws always - CockroachDB has no array type for `jsonb`
	 */
	override array(): never {
		throw new Error('CockroachDB does not support arrays of jsonb columns');
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

export class CockroachJsonb<T extends CockroachColumnBaseConfig<'object json'>>
	extends CockroachColumn<'object json', T>
{
	static override readonly [entityKind]: string = 'CockroachJsonb';

	/** @internal */
	override readonly codec = 'jsonb';

	constructor(table: CockroachTable<any>, config: CockroachColumnBuilderRuntimeConfig<T['data']>) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue = (value: T['data']): string => {
		return JSON.stringify(value);
	};
}

export function jsonb(name?: string) {
	return new CockroachJsonbBuilder(name ?? '');
}
