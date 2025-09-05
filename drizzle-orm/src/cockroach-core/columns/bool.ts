import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachBooleanBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: boolean;
}> {
	static override readonly [entityKind]: string = 'CockroachBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'CockroachBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachBoolean(
			table,
			this.config,
		);
	}
}

export class CockroachBoolean<T extends ColumnBaseConfig<'boolean'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachBoolean';

	getSQLType(): string {
		return 'bool';
	}
}

export function bool(name?: string) {
	return new CockroachBooleanBuilder(name ?? '');
}

export const boolean = bool;
