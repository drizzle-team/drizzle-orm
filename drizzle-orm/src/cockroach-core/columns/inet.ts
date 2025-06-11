import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyCockroachTable } from '../table.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachInetBuilderInitial<TName extends string> = CockroachInetBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachInet';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachInetBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachInet'>>
	extends CockroachColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachInetBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'CockroachInet');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachInet<MakeColumnConfig<T, TTableName>> {
		return new CockroachInet<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachInet<T extends ColumnBaseConfig<'string', 'CockroachInet'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(): CockroachInetBuilderInitial<''>;
export function inet<TName extends string>(name: TName): CockroachInetBuilderInitial<TName>;
export function inet(name?: string) {
	return new CockroachInetBuilder(name ?? '');
}
