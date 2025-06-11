import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyCockroachDbTable } from '../table.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbInetBuilderInitial<TName extends string> = CockroachDbInetBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbInet';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbInetBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDbInet'>>
	extends CockroachDbColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbInetBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'CockroachDbInet');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbInet<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbInet<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbInet<T extends ColumnBaseConfig<'string', 'CockroachDbInet'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(): CockroachDbInetBuilderInitial<''>;
export function inet<TName extends string>(name: TName): CockroachDbInetBuilderInitial<TName>;
export function inet(name?: string) {
	return new CockroachDbInetBuilder(name ?? '');
}
