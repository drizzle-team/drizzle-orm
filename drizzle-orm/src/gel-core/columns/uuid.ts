import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelUUIDBuilderInitial<TName extends string> = GelUUIDBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GelUUID';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GelUUIDBuilder<T extends ColumnBuilderBaseConfig<'string', 'GelUUID'>> extends GelColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GelUUIDBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'GelUUID');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelUUID<MakeColumnConfig<T, TTableName>> {
		return new GelUUID<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GelUUID<T extends ColumnBaseConfig<'string', 'GelUUID'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(): GelUUIDBuilderInitial<''>;
export function uuid<TName extends string>(name: TName): GelUUIDBuilderInitial<TName>;
export function uuid(name?: string) {
	return new GelUUIDBuilder(name ?? '');
}
