import type { AnyColumn } from './column';
import { Column } from './column';
import type { SelectFields, SelectFieldsOrdered } from './operations';
import type { DriverValueDecoder } from './sql';
import { Param, SQL } from './sql';
import { getTableName, Table } from './table';

/**
 * @deprecated
 * Use `compatibilityVersion` from `drizzle-orm/version` instead.
 */
export const apiVersion = 2;
/**
 * @deprecated
 * Use `npmVersion` from `drizzle-orm/version` instead.
 */
export const npmVersion = '0.17.0';

export function mapResultRow<TResult>(
	columns: SelectFieldsOrdered<AnyColumn>,
	row: unknown[],
	joinsNotNullableMap: Record<string, boolean> | undefined,
): TResult {
	// Key -> nested object key, value -> table name if all fields in the nested object are from the same table, false otherwise
	const nullifyMap: Record<string, string | false> = {};

	const result = columns.reduce<Record<string, any>>(
		(result, { path, field }, columnIndex) => {
			let decoder: DriverValueDecoder<unknown, unknown>;
			if (field instanceof Column) {
				decoder = field;
			} else if (field instanceof SQL) {
				decoder = field.decoder;
			} else {
				decoder = field.sql.decoder;
			}
			let node = result;
			path.forEach((pathChunk, pathChunkIndex) => {
				if (pathChunkIndex < path.length - 1) {
					if (!(pathChunk in node)) {
						node[pathChunk] = {};
					}
					node = node[pathChunk];
				} else {
					const rawValue = row[columnIndex]!;
					const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);

					if (joinsNotNullableMap && field instanceof Column && path.length === 2) {
						const objectName = path[0]!;
						if (!(objectName in nullifyMap)) {
							if (value === null) {
								nullifyMap[objectName] = getTableName(field.table);
							} else {
								nullifyMap[objectName] = false;
							}
						} else if (
							typeof nullifyMap[objectName] === 'string' && nullifyMap[objectName] !== getTableName(field.table)
						) {
							nullifyMap[objectName] = false;
						}
					}
				}
			});
			return result;
		},
		{},
	);

	// Nullify all nested objects from nullifyMap that are nullable
	if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
		Object.entries(nullifyMap).forEach(([objectName, tableName]) => {
			if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
				result[objectName] = null;
			}
		});
	}

	return result as TResult;
}

export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: SelectFields<AnyColumn, Table>,
	pathPrefix?: string[],
): SelectFieldsOrdered<TColumn> {
	return Object.entries(fields).reduce<SelectFieldsOrdered<AnyColumn>>((result, [name, field]) => {
		if (typeof name !== 'string') {
			return result;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (
			field instanceof Column
			|| field instanceof SQL
			|| field instanceof SQL.Aliased
		) {
			result.push({ path: newPath, field });
		} else if (field instanceof Table) {
			result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
		} else {
			result.push(...orderSelectedFields(field, newPath));
		}
		return result;
	}, []) as SelectFieldsOrdered<TColumn>;
}

/** @internal */
export function mapUpdateSet(table: Table, values: Record<string, unknown>): UpdateSet {
	return Object.fromEntries<UpdateSet[string]>(
		Object.entries(values).map(([key, value]) => {
			if (value instanceof SQL || value === null || value === undefined) {
				return [key, value];
			} else {
				return [key, new Param(value, table[Table.Symbol.Columns][key])];
			}
		}),
	);
}

export type UpdateSet = Record<string, SQL | Param | null | undefined>;

export type OneOrMany<T> = T | T[];

export type Update<T, TUpdate> = Simplify<
	& Omit<T, keyof TUpdate>
	& TUpdate
>;

// Flatten and Simplify copied from https://github.com/sindresorhus/type-fest

/**
@see Simplify
*/
export interface SimplifyOptions {
	/**
	Do the simplification recursively.

	@default false
	*/
	deep?: boolean;
}

// Flatten a type without worrying about the result.
type Flatten<
	AnyType,
	Options extends SimplifyOptions = {},
> = Options['deep'] extends true ? { [KeyType in keyof AnyType]: Simplify<AnyType[KeyType], Options> }
	: { [KeyType in keyof AnyType]: AnyType[KeyType] };

/**
Useful to flatten the type output to improve type hints shown in editors. And also to transform an interface into a type to aide with assignability.

@example
```
import type {Simplify} from 'type-fest';

type PositionProps = {
	top: number;
	left: number;
};

type SizeProps = {
	width: number;
	height: number;
};

// In your editor, hovering over `Props` will show a flattened object with all the properties.
type Props = Simplify<PositionProps & SizeProps>;
```

Sometimes it is desired to pass a value as a function argument that has a different type. At first inspection it may seem assignable, and then you discover it is not because the `value`'s type definition was defined as an interface. In the following example, `fn` requires an argument of type `Record<string, unknown>`. If the value is defined as a literal, then it is assignable. And if the `value` is defined as type using the `Simplify` utility the value is assignable.  But if the `value` is defined as an interface, it is not assignable because the interface is not sealed and elsewhere a non-string property could be added to the interface.

If the type definition must be an interface (perhaps it was defined in a third-party npm package), then the `value` can be defined as `const value: Simplify<SomeInterface> = ...`. Then `value` will be assignable to the `fn` argument.  Or the `value` can be cast as `Simplify<SomeInterface>` if you can't re-declare the `value`.

@example
```
import type {Simplify} from 'type-fest';

interface SomeInterface {
	foo: number;
	bar?: string;
	baz: number | undefined;
}

type SomeType = {
	foo: number;
	bar?: string;
	baz: number | undefined;
};

const literal = {foo: 123, bar: 'hello', baz: 456};
const someType: SomeType = literal;
const someInterface: SomeInterface = literal;

function fn(object: Record<string, unknown>): void {}

fn(literal); // Good: literal object type is sealed
fn(someType); // Good: type is sealed
fn(someInterface); // Error: Index signature for type 'string' is missing in type 'someInterface'. Because `interface` can be re-opened
fn(someInterface as Simplify<SomeInterface>); // Good: transform an `interface` into a `type`
```

@link https://github.com/microsoft/TypeScript/issues/15300

@category Object
*/
export type Simplify<
	AnyType,
	Options extends SimplifyOptions = {},
> = Flatten<AnyType> extends AnyType ? Flatten<AnyType, Options>
	: AnyType;

export type Assume<T, U> = T extends U ? T : U;

export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

export interface DrizzleTypeError<T extends string> {
	$brand: 'DrizzleTypeError';
	message: T;
}

export type ValueOrArray<T> = T | T[];

export function applyMixins(baseClass: any, extendedClasses: any[]) {
	extendedClasses.forEach((extendedClass) => {
		Object.getOwnPropertyNames(extendedClass.prototype).forEach((name) => {
			Object.defineProperty(
				baseClass.prototype,
				name,
				Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || Object.create(null),
			);
		});
	});
}
