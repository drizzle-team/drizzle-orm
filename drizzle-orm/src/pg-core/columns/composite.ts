import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { makePgArray } from '../utils/array.ts';
import { makePgComposite, parsePgComposite } from '../utils/composite.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

const isPgCompositeSym = Symbol.for('drizzle:isPgComposite');

/**
 * Map of field names to column builders. The order of keys defines the field order
 * of the underlying PostgreSQL composite (row) type.
 */
export type PgCompositeFields = Record<string, PgColumnBuilder<any, any>>;

type BuilderData<TBuilder> = TBuilder extends PgColumnBuilder<infer C, any>
	? (C extends { data: infer D } ? D : unknown)
	: never;

type BuilderNotNull<TBuilder> = TBuilder extends PgColumnBuilder<infer C, any>
	? (C extends { notNull: true } ? true : false)
	: false;

/**
 * Infer the JS object shape of a composite type from its field builders.
 * Fields that were declared with `.notNull()` become required and non-nullable;
 * everything else is `T | null`.
 */
export type InferCompositeData<TFields extends PgCompositeFields> =
	& {
		[K in keyof TFields as BuilderNotNull<TFields[K]> extends true ? K : never]: BuilderData<TFields[K]>;
	}
	& {
		[K in keyof TFields as BuilderNotNull<TFields[K]> extends true ? never : K]: BuilderData<TFields[K]> | null;
	};

export interface PgComposite<TFields extends PgCompositeFields = PgCompositeFields> {
	(name?: string): PgCompositeColumnBuilder<TFields>;

	readonly compositeName: string;
	readonly compositeFields: TFields;
	readonly schema: string | undefined;
	/** @internal */
	[isPgCompositeSym]: true;
}

export function isPgComposite(obj: unknown): obj is PgComposite {
	return !!obj && typeof obj === 'function' && isPgCompositeSym in obj && obj[isPgCompositeSym] === true;
}

export class PgCompositeColumnBuilder<
	TFields extends PgCompositeFields,
> extends PgColumnBuilder<{
	dataType: 'object composite';
	data: InferCompositeData<TFields>;
	driverParam: string;
}, { composite: PgComposite<TFields> }> {
	static override readonly [entityKind]: string = 'PgCompositeColumnBuilder';

	constructor(name: string, compositeInstance: PgComposite<TFields>) {
		super(name, 'object composite' as any, 'PgCompositeColumn');
		this.config.composite = compositeInstance;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgCompositeColumn(table, this.config as any);
	}
}

export class PgCompositeColumn<TFields extends PgCompositeFields> extends PgColumn<'object composite'> {
	static override readonly [entityKind]: string = 'PgCompositeColumn';

	readonly composite: PgComposite<TFields>;
	private _builtFields: Map<string, PgColumn> | undefined;

	constructor(
		table: PgTable<any>,
		config: PgCompositeColumnBuilder<TFields>['config'],
	) {
		super(table, config as any);
		this.composite = config.composite as PgComposite<TFields>;
	}

	getSQLType(): string {
		// Match `pgEnum`'s convention: emit the unqualified name.
		// Schema-qualification is handled by drizzle-kit when generating DDL/migrations.
		return this.composite.compositeName;
	}

	private getBuiltFields(): Map<string, PgColumn> {
		if (this._builtFields) return this._builtFields;
		const built = new Map<string, PgColumn>();
		for (const [name, builder] of Object.entries(this.composite.compositeFields)) {
			built.set(name, (builder as any).build(this.table));
		}
		this._builtFields = built;
		return built;
	}

	override mapFromDriverValue(value: string): InferCompositeData<TFields> {
		const rawFields = parsePgComposite(value);
		const fieldOrder = Object.keys(this.composite.compositeFields);
		const built = this.getBuiltFields();
		const result: Record<string, unknown> = {};
		for (let i = 0; i < fieldOrder.length; i++) {
			const fieldName = fieldOrder[i]!;
			const raw = rawFields[i];
			if (raw === null || raw === undefined) {
				result[fieldName] = null;
			} else {
				const fieldColumn = built.get(fieldName)!;
				const coerced = coerceCompositeFieldText(raw, fieldColumn.dataType);
				result[fieldName] = fieldColumn.mapFromDriverValue(coerced as never);
			}
		}
		return result as InferCompositeData<TFields>;
	}

	override mapToDriverValue(value: InferCompositeData<TFields>): string {
		const fieldOrder = Object.keys(this.composite.compositeFields);
		const built = this.getBuiltFields();
		const rawFields: (string | null)[] = fieldOrder.map((fieldName) => {
			const fieldValue = (value as Record<string, unknown>)[fieldName];
			if (fieldValue === null || fieldValue === undefined) return null;
			const driverValue = built.get(fieldName)!.mapToDriverValue(fieldValue);
			return formatDriverValueForComposite(driverValue);
		});
		return makePgComposite(rawFields);
	}
}

/**
 * Coerce a raw composite-field text fragment into the value shape that a column's
 * `mapFromDriverValue` expects from its driver. Drivers normally pre-parse simple
 * types from PG's wire protocol (boolean → JS boolean, jsonb → object, etc.), but
 * fields nested inside a composite arrive as raw text and have to be re-parsed here.
 * Anything we don't recognize is passed through unchanged so column-level mappers
 * (e.g. for numeric strings) still work.
 */
function coerceCompositeFieldText(raw: string, dataType: string): unknown {
	if (dataType === 'boolean') return raw === 't' || raw === 'true';
	if (dataType === 'object json' || dataType === 'object jsonb') {
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	}
	if (dataType === 'object date' || dataType.startsWith('string date') || dataType.startsWith('string timestamp')) {
		return raw;
	}
	return raw;
}

/**
 * Convert a driver-bound value (the output of a column's `mapToDriverValue`) into
 * the text form expected inside a PostgreSQL composite literal. The composite
 * codec handles quoting/escaping; this function only handles the per-type
 * scalar-to-string conversion.
 */
function formatDriverValueForComposite(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;
	if (typeof value === 'boolean') return value ? 't' : 'f';
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	// Duck-type Date and Uint8Array — drizzle bans `instanceof` repo-wide.
	const tag = Object.prototype.toString.call(value);
	if (tag === '[object Date]') return (value as Date).toISOString();
	if (ArrayBuffer.isView(value) && tag === '[object Uint8Array]') {
		const bytes = value as Uint8Array;
		let hex = '\\x';
		for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
		return hex;
	}
	if (Array.isArray(value)) {
		return makePgArray(value);
	}
	// Fallback: works for plain objects via JSON.stringify (json/jsonb columns).
	return JSON.stringify(value);
}

export function pgComposite<TFields extends PgCompositeFields>(
	compositeName: string,
	fields: TFields,
): PgComposite<TFields> {
	return pgCompositeWithSchema(compositeName, fields, undefined);
}

/** @internal */
export function pgCompositeWithSchema<TFields extends PgCompositeFields>(
	compositeName: string,
	fields: TFields,
	schema?: string,
): PgComposite<TFields> {
	const instance: PgComposite<TFields> = Object.assign(
		(name?: string): PgCompositeColumnBuilder<TFields> => new PgCompositeColumnBuilder(name ?? '', instance),
		{
			compositeName,
			compositeFields: fields,
			schema,
			[isPgCompositeSym]: true,
		} as const,
	);

	return instance;
}
