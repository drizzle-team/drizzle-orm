import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

type GelTextBuilderInitial<TName extends string> = GelTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GelText';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GelTextBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'GelText'>,
> extends GelColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GelTextBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'string', 'GelText');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelText<MakeColumnConfig<T, TTableName>> {
		return new GelText<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GelText<T extends ColumnBaseConfig<'string', 'GelText'>>
	extends GelColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'GelText';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return 'text';
	}
}

export function text(): GelTextBuilderInitial<''>;
export function text<TName extends string>(name: TName): GelTextBuilderInitial<TName>;
export function text(name?: string): any {
	return new GelTextBuilder(name ?? '');
}
