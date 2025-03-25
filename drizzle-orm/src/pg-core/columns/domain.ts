import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

// drizzle column type identifier
export const PG_DOMAIN_TYPE = 'PgDomainColumn' as const;
export type PgDomainType = typeof PG_DOMAIN_TYPE;

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
		PgDomainType
	>
	& PgDomainColumnBaseConfig<TColumnBase>;

// domain column config
// extends from the builder config but adds more fields
type PgDomainColumnConfig<TColumnBase extends PgColumnBuilder<any, any>> =
	& ColumnBaseConfig<
		TColumnBase['_']['dataType'],
		PgDomainType
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

	// used internally for serialization and introspection
	readonly domainName: string;
	readonly schema: string | undefined;
	readonly columnBuilder: PgColumnBuilder<any, any>;
	readonly columnConfig: Readonly<ColumnBuilderRuntimeConfig<any, any>>;

	constructor(name: T['name'], interfaceInstance: PgDomain<PgColumnBuilder<any, any>>) {
		super(name, interfaceInstance.columnBuilder.getDataType(), PG_DOMAIN_TYPE);

		this.domainName = interfaceInstance.domainName;
		this.schema = interfaceInstance.schema;
		this.columnBuilder = interfaceInstance.columnBuilder;
		this.columnConfig = this.columnBuilder.readonlyConfig;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<MakeColumnConfig<T, TTableName>> {
		const column = this.columnBuilder.build(table);

		Object.assign(this.config, {
			column,
			schema: this.config.schema,
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
	static override readonly [entityKind]: string = PG_DOMAIN_TYPE;

	// TODO confirm if needed or not
	readonly schema: string | undefined;
	readonly domain: PgColumn;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgDomainColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.schema = config.schema;
		this.domain = config.column;
	}

	getSQLType(): string {
		return this.name;
	}
}

const isPgDomainSym = Symbol.for('drizzle:isPgDomain');

// pg domains can be in their builder or built forms when used internally which complicates usage
// this interface makes it easy to both construct the builder and get relevant values
export interface PgDomain<TColumnBuilder extends PgColumnBuilder<any, any>> {
	(name?: string): PgDomainColumnBuilder<PgDomainColumnBuilderConfig<TColumnBuilder>>;

	readonly domainName: string;
	readonly schema: string | undefined;
	readonly columnBuilder: TColumnBuilder;

	/** @internal */
	[isPgDomainSym]: true;
}

// used internally for confirming an object is a PgDomain interface instance
export function isPgDomain(obj: unknown): obj is PgDomain<PgColumnBuilder<any, any>> {
	return !!obj && typeof obj === 'function' && isPgDomainSym in obj && obj[isPgDomainSym] === true;
}

// factory functions
export function pgDomain<TColumnBuilder extends PgColumnBuilder<any, any>>(
	domainName: string,
	columnBuilder: TColumnBuilder,
) {
	return pgDomainWithSchema(domainName, columnBuilder, undefined);
}

/** @internal */
export function pgDomainWithSchema<TColumnBuilder extends PgColumnBuilder<any, any>>(
	domainName: string,
	columnBuilder: TColumnBuilder,
	schema?: string,
) {
	// handy trick to save off the initially passed params and have a unified interface
	// calls to this returned object will need to pass a column name for that particular table
	const instanceWrapper = Object.assign(
		<TName extends string = ''>(name?: TName) =>
			new PgDomainColumnBuilder<PgDomainColumnBuilderConfig<TColumnBuilder>>(name ?? '' as TName, instanceWrapper),
		{
			domainName,
			schema,
			columnBuilder,
			[isPgDomainSym]: true,
		} as const,
	) as PgDomain<TColumnBuilder>;

	return instanceWrapper;
}
