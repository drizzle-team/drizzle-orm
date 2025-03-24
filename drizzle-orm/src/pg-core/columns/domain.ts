import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

// drizzle column type identifier
export const PG_DOMAIN_COLUMN_TYPE = 'PgDomainColumn' as const;
export type PgDomainColumnType = typeof PG_DOMAIN_COLUMN_TYPE;

// Shared base type for the common properties
// we inherit these from the wrapped builder
type PgDomainColumnBaseConfig<TColumnBase extends PgColumnBuilder<any, any>> = {
	data: TColumnBase['_']['data'];
	notNull: TColumnBase['_']['notNull'];
	hasDefault: TColumnBase['_']['hasDefault'];
	identity: TColumnBase['_']['identity'];
	generated: TColumnBase['_']['generated'];
};

// domain column builder config
// this sets up everything inside ColumnBuilderBaseConfig except for data, driverParam, and enumValues
type PgDomainColumnBuilderConfig<TColumnBase extends PgColumnBuilder<any, any>> =
	& ColumnBuilderBaseConfig<
		TColumnBase['_']['dataType'],
		PgDomainColumnType
	>
	& PgDomainColumnBaseConfig<TColumnBase>;

// domain column config
// extends from the builder config but adds more fields
type PgDomainColumnConfig<TColumnBase extends PgColumnBuilder<any, any>> =
	& ColumnBaseConfig<
		TColumnBase['_']['dataType'],
		PgDomainColumnType
	>
	& PgDomainColumnBaseConfig<TColumnBase>;

// extras that we need at runtime
export type BuilderRuntimeConfig = {
	column: PgColumn<any, any>;
	schema?: string;
};

// domain column builder classa
export class PgDomainColumnBuilder<
	T extends PgDomainColumnBuilderConfig<PgColumnBuilder<any, any>>,
> extends PgColumnBuilder<T, BuilderRuntimeConfig> {
	static override readonly [entityKind]: string = 'PgDomainColumnBuilder';

	columnBuilder: PgColumnBuilder<any, any>;

	constructor(name: T['name'], columnBuilder: PgColumnBuilder<any, any>, schema?: string) {
		super(name, columnBuilder.getDataType(), PG_DOMAIN_COLUMN_TYPE);
		// this.config.columnBuilder = columnBuilder;
		// this.config.notNull = true;
		this.config.schema = schema;

		this.columnBuilder = columnBuilder;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<MakeColumnConfig<T, TTableName>> {
		const column = this.columnBuilder.build(table);

		Object.assign(this.config, {
			column,
			notNull: column.notNull,
			hasDefault: column.hasDefault,
			generated: column.generated,
			generatedIdentity: column.generatedIdentity,
			checkConstraints: column.checkConstraints,
		});

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
		this.column = config.column;
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
	return new PgDomainColumnBuilder<PgDomainColumnBuilderConfig<TColumnBuilder>>(
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
