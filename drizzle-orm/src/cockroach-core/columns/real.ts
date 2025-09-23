import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachRealBuilder extends CockroachColumnWithArrayBuilder<
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

export class CockroachReal<T extends ColumnBaseConfig<'number float'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachReal';

	constructor(table: CockroachTable<any>, config: CockroachRealBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: string | number): number => {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	};
}

export function real(name?: string) {
	return new CockroachRealBuilder(name ?? '');
}
