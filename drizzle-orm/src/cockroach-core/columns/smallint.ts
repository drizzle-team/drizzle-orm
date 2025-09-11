import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn } from './common.ts';
import { CockroachIntColumnBaseBuilder } from './int.common.ts';

export class CockroachSmallIntBuilder extends CockroachIntColumnBaseBuilder<{
	dataType: 'number int16';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'CockroachSmallIntBuilder';

	constructor(name: string) {
		super(name, 'number int16', 'CockroachSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachSmallInt(
			table,
			this.config,
		);
	}
}

export class CockroachSmallInt<T extends ColumnBaseConfig<'number int16'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachSmallInt';

	getSQLType(): string {
		return 'int2';
	}

	override mapFromDriverValue = (value: number | string): number => {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	};
}

export function smallint(name?: string) {
	return new CockroachSmallIntBuilder(name ?? '');
}
export function int2(name?: string) {
	return new CockroachSmallIntBuilder(name ?? '');
}
