import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, CockroachColumnBuilder } from './common.ts';

export class CockroachBooleanBuilder extends CockroachColumnBuilder<{
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

export class CockroachBoolean<T extends CockroachColumnBaseConfig<'boolean'>> extends CockroachColumn<'boolean', T> {
	static override readonly [entityKind]: string = 'CockroachBoolean';

	/** @internal */
	override readonly codec = 'bool';

	getSQLType(): string {
		return 'bool';
	}
}

export function bool(name?: string) {
	return new CockroachBooleanBuilder(name ?? '');
}

export const boolean = bool;
