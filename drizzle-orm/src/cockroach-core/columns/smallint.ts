import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, type CockroachColumnBaseConfig } from './common.ts';
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

export class CockroachSmallInt<T extends CockroachColumnBaseConfig<'number int16'>>
	extends CockroachColumn<'number int16', T>
{
	static override readonly [entityKind]: string = 'CockroachSmallInt';

	/** @internal */
	override readonly codec = 'int2';

	getSQLType(): string {
		return 'int2';
	}
}

export function smallint(name?: string) {
	return new CockroachSmallIntBuilder(name ?? '');
}
export function int2(name?: string) {
	return new CockroachSmallIntBuilder(name ?? '');
}
