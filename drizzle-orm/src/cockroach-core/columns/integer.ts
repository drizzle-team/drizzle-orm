import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyCockroachTable } from '../table.ts';
import { CockroachColumn } from './common.ts';
import { CockroachIntColumnBaseBuilder } from './int.common.ts';

export class CockroachIntegerBuilder extends CockroachIntColumnBaseBuilder<{
	dataType: 'number int32';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'CockroachIntegerBuilder';

	constructor(name: string) {
		super(name, 'number int32', 'CockroachInteger');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachInteger(
			table,
			this.config,
		);
	}
}

export class CockroachInteger<T extends ColumnBaseConfig<'number int32'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachInteger';

	getSQLType(): string {
		return 'int4';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export function int4(name?: string) {
	return new CockroachIntegerBuilder(name ?? '');
}
