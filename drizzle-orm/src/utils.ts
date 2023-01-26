import { Column } from './column';
import { SelectFieldsOrdered } from './operations';
import { DriverValueDecoder, noopDecoder, SQL } from './sql';

/**
 * @deprecated
 * Use `compatibilityVersion` instead.
 */
export const apiVersion = 2;
export const compatibilityVersion = 2;
export const npmVersion = '0.15.0';

export function mapResultRow<TResult>(
	columns: SelectFieldsOrdered,
	row: unknown[],
	joinsNotNullable?: Record<string, boolean>,
): TResult {
	const result = columns.reduce<Record<string, any>>(
		(result, { path, field }, columnIndex) => {
			let decoder: DriverValueDecoder<unknown, unknown>;
			if (field instanceof Column) {
				decoder = field;
			} else if (field instanceof SQL) {
				decoder = noopDecoder;
			} else {
				decoder = field.decoder;
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
					node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
				}
			});
			return result;
		},
		{},
	);

	if (!joinsNotNullable) {
		return result as TResult;
	}

	// If all fields in a table are null, return null for the table
	return Object.fromEntries(
		Object.entries(result).map(([tableName, tableResult]) => {
			if (!joinsNotNullable[tableName]) {
				const hasNotNull = Object.values(tableResult).some((value) => value !== null);
				if (!hasNotNull) {
					return [tableName, null];
				}
			}
			return [tableName, tableResult];
		}),
	) as TResult;
}

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
