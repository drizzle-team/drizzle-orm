import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import {
	CockroachColumn,
	type CockroachColumnBaseConfig,
	CockroachColumnBuilder,
	type CockroachColumnBuilderRuntimeConfig,
} from './common.ts';

export class CockroachRealBuilder extends CockroachColumnBuilder<
	{
		dataType: 'number float';
		data: number;
		driverParam: string | number;
	},
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachRealBuilder';

	constructor(name: string, length?: number) {
		super(name, 'number float', 'CockroachReal');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachReal(
			table,
			this.config,
		);
	}
}

export class CockroachReal<T extends CockroachColumnBaseConfig<'number float'>>
	extends CockroachColumn<'number float', T>
{
	static override readonly [entityKind]: string = 'CockroachReal';

	/** @internal */
	override readonly codec = 'real';

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & { length: number | undefined },
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}
}

export function real(name?: string) {
	return new CockroachRealBuilder(name ?? '');
}
