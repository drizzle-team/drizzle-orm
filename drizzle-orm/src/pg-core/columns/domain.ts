import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

// drizzle column type identifier
type PgDomainColumnType = 'PgDomainColumn';

// domain column builder config
// this sets up everything inside ColumnBuilderBaseConfig except for data, driverParam, and enumValues
type PgDomainColumnBuilderConfig<TColumnBase extends PgColumnBuilder<any, any>> = ColumnBuilderBaseConfig<
	TColumnBase['_']['dataType'],
	PgDomainColumnType
>;

// domain column config
// extends from the builder config but adds more fields
type PgDomainColumnConfig<TColumnBase extends PgColumnBuilder<any, any>> = ColumnBaseConfig<
	TColumnBase['_']['dataType'],
	PgDomainColumnType
>;

// extras that we need at runtime
export type BuilderRuntimeConfig = {
	columnBuilder: PgColumnBuilder<any, any>;
	schema?: string;
};

// domain column builder class
export class PgDomainColumnBuilder<
	T extends PgDomainColumnBuilderConfig<PgColumnBuilder<any, any>>,
> extends PgColumnBuilder<T, BuilderRuntimeConfig> {
	static override readonly [entityKind]: string = 'PgDomainColumnBuilder';

	constructor(name: T['name'], columnBuilder: PgColumnBuilder<any, any>, schema?: string) {
		super(name, columnBuilder.getDataType(), columnBuilder.getColumnType());
		this.config.columnBuilder = columnBuilder;
		this.config.schema = schema;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<MakeColumnConfig<T, TTableName>> {
		return new PgDomainColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

// domain column class
export class PgDomainColumn<T extends PgDomainColumnConfig<PgColumnBuilder<any, any>>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgDomainColumn';

	readonly schema: string | undefined;
	readonly column: PgColumn;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgDomainColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.schema = config.schema;
		this.column = config.columnBuilder.build(table);
	}

	getSQLType(): string {
		return this.name;
	}
}

// factory functions
export function pgDomain<TColumnBuilder extends PgColumnBuilder<any, any>>(
	name: string,
	columnBuilder: TColumnBuilder,
) {
	return pgDomainWithSchema(name, columnBuilder, undefined);
}

// used inside schema.ts
/** @internal */
export function pgDomainWithSchema<TColumnBuilder extends PgColumnBuilder<any, any>>(
	name: string,
	columnBuilder: TColumnBuilder,
	schema?: string,
) {
	return new PgDomainColumnBuilder<PgDomainColumnConfig<TColumnBuilder>>(
		name ?? '',
		columnBuilder,
		schema,
	);
}

// const isPgDomainSym = Symbol.for('drizzle:isPgDomain');

// interface for later
// export interface PgDomain<TColumnBase extends PgColumnBuilder<any, any>> {
// 	(): PgDomainColumnBuilderInitial<'', TColumnBase>;
// 	<TName extends string>(name: TName): PgDomainColumnBuilderInitial<TName, TColumnBase>;
//
// 	/** @internal */
// 	[isPgDomainSym]: true;
// }

// export function isPgDomain(obj: unknown): obj is PgDomain<PgColumnBuilder<any, any>> {
// 	return !!obj && typeof obj === 'function' && isPgDomainSym in obj && obj[isPgDomainSym] === true;
// }

// initial domain column builder config filling in generic parameterization values
// the name type param is used for type narrowing / autocomplete
// export type PgDomainColumnBuilderInitial<TName extends string, TColumnBase extends PgColumnBuilder<any, any>> =
// 	& PgDomainColumnBuilderConfig<TColumnBase>
// 	& {
// 		name: TName;
// 		data: TColumnBase['_']['data'];
// 		enumValues: undefined;
// 	};
