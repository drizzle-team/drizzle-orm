type DataType = 'string' | 'string[]' | 'number' | 'boolean';

type TypeMap = {
	string: string;
	number: number;
	boolean: boolean;
	'string[]': string[];
};

type Simplify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

type Assume<T, U> = T extends U ? T : U;

type ExtendedType =
	| (`${Exclude<DataType, 'string[]'>}?` | DataType)
	| 'required'
	| [string, ...(string | null)[]]
	| {
		[K: string]: Exclude<ExtendedType, 'required'>;
	}
	| ([{
		[K: string]: Exclude<ExtendedType, 'required'>;
	}]);

type InferField<T extends ExtendedType> = T extends (string | null)[] ? T[number]
	: T extends [Record<string, ExtendedType>] ? {
			[K in keyof T[0]]: InferField<T[0][K]>;
		}[]
	: T extends Record<string, ExtendedType> ?
			| {
				[K in keyof T]: InferField<T[K]>;
			}
			| null
	: T extends `${infer Type extends DataType}?` ? TypeMap[Type] | null
	: T extends DataType ? TypeMap[T]
	: never;

type Definition = Record<string, Schema>;

type InferSchema<TSchema extends Schema> = Simplify<
	{
		-readonly [K in keyof TSchema]: K extends keyof Common ? Exclude<Common[K], null>
			: InferField<Assume<TSchema[K], ExtendedType>>;
	}
>;

type NullAsUndefined<TData extends Record<string, any>> =
	& {
		[K in keyof TData as null extends TData[K] ? K : never]: TData[K] | undefined;
	}
	& {
		[K in keyof TData as null extends TData[K] ? never : K]: TData[K];
	};

type Schema =
	& Record<string, ExtendedType>
	& {
		[K in keyof Common as null extends Common[K] ? K : never]?: 'required';
	}
	& {
		[K in keyof Common as null extends Common[K] ? never : K]?: never;
	}
	& {
		[K in `${keyof Common}?`]?: never;
	}
	& {
		entityType?: never;
		CONTAINS?: never;
	};

type Common = {
	schema: string | null;
	table: string | null;
	name: string;
};

const commonConfig: Record<string, `${DataType}${'' | '?'}`> = {
	schema: 'string?',
	table: 'string?',
	name: 'string',
};

type InferEntities<
	TDefinition extends Definition,
> = {
	[K in keyof TDefinition]: Simplify<
		& InferSchema<TDefinition[K]>
		& {
			[C in keyof Common as C extends keyof TDefinition[K] ? never : null extends Common[C] ? never : C]: Common[C];
		}
		& {
			entityType: K;
		}
	>;
};

type Filter<TInput extends Record<string, any> = Record<string, any>> = {
	[K in keyof TInput]?:
		| TInput[K]
		| (TInput[K] extends (any[] | null) ? {
				CONTAINS: TInput[K][number];
			}
			: never);
};

type UpdateOperators<TInput extends Record<string, any>> = {
	[K in keyof TInput]?:
		| TInput[K]
		| ((
			item: TInput[K] extends any[] | null ? Exclude<TInput[K], null>[number] : TInput[K],
		) => TInput[K] extends any[] | null ? Exclude<TInput[K], null>[number] : TInput[K]);
};

type CollectionStore = {
	collection: Record<string, any>[];
};

function matchesFilters(item: Record<string, any>, filter: Filter): boolean {
	for (const [k, v] of Object.entries(filter)) {
		if (v === undefined) continue;
		const target = item[k];

		if ((v && typeof v === 'object' && v.CONTAINS !== undefined)) {
			if (!Array.isArray(target)) return false;
			if (!target.find((e) => isEqual(e, v.CONTAINS))) return false;
		} else {
			if (!isEqual(target, v)) return false;
		}
	}

	return true;
}

function filterCollection(collection: Record<string, any>[], filter: Filter) {
	return collection.filter((e) => matchesFilters(e, filter));
}

type CommonEntity = Common & {
	entityType: string;
};

function getCompositeKey(
	row: CommonEntity,
): string {
	return `${row.schema ?? ''}:${row.table ?? ''}:${row.name}:${row.entityType}`;
}

function findCompositeKey(dataSource: (CommonEntity)[], target: CommonEntity) {
	const targetKey = getCompositeKey(target);
	const match = dataSource.find((e) => getCompositeKey(e) === targetKey);

	return match;
}

function findCompositeKeys(dataSource: (CommonEntity)[], target: CommonEntity) {
	const targetKey = getCompositeKey(target);
	const match = dataSource.filter((e) => getCompositeKey(e) === targetKey);

	return match;
}

// function replaceValue(arr: Array<any>, target: any, update: any) {
// 	for (var i = 0; i < arr.length; i++) {
// 		if (arr[i] === target) {
// 			arr[i] = update;
// 		}
// 	}
// 	return arr;
// }

export type InferInsert<TShape extends Record<string, any>, TCommon extends boolean = false> = TShape extends
	infer Shape ? Simplify<
		TCommon extends true ? NullAsUndefined<
				{
					[
						K in keyof Shape as K extends keyof Common ? (null extends Common[K] ? null extends Shape[K] ? never
								: K
								: K)
							: K
					]: Shape[K];
				}
			>
			: Omit<
				NullAsUndefined<
					{
						[
							K in keyof TShape as K extends keyof Common ? (null extends Common[K] ? null extends TShape[K] ? never
									: K
									: K)
								: K
						]: TShape[K];
					}
				>,
				'entityType'
			>
	>
	: never;

type PushFn<
	TInput extends Record<string, any>,
	TCommon extends boolean = false,
> = (
	input: InferInsert<TInput, TCommon>,
	uniques?: TInput extends infer Input ? (Exclude<Assume<keyof Input, string>, 'entityType'>)[] : never,
) => {
	status: 'OK' | 'CONFLICT';
	data: TInput extends [Record<string, any>, Record<string, any>, ...Record<string, any>[]] ? TInput[] : TInput;
};
type ListFn<TInput extends Record<string, any>> = (where?: Filter<TInput>) => TInput[];
type OneFn<TInput extends Record<string, any>> = (where?: Filter<TInput>) => TInput | null;
type UpdateFn<TInput extends Record<string, any>> = (
	config: TInput extends infer Input extends Record<string, any>
		? { set: Simplify<UpdateOperators<Omit<Input, 'entityType'>>>; where?: Filter<Input> }
		: never,
) => {
	status: 'OK' | 'CONFLICT';
	data: TInput[];
};
type DeleteFn<TInput extends Record<string, any>> = (
	where?: TInput extends infer Input extends Record<string, any> ? Filter<Input> : never,
) => TInput[];
type ValidateFn<TInput extends Record<string, any>> = (data: unknown) => data is TInput;
type HasDiffFn<
	TSchema extends Record<string, any>,
	TType extends string,
> = (
	input: DiffAlter<TSchema, TType>,
) => boolean;

const generateInsert: (configs: Record<string, Config>, store: CollectionStore, type?: string) => PushFn<any> = (
	configs,
	store,
	type,
) => {
	let nulls = type
		? Object.fromEntries(
			Object.keys(configs[type]).filter((e) => !commonConfig[e] || !(commonConfig[e] as string).endsWith('?')).map((
				e,
			) => [e, null]),
		)
		: undefined;

	return (input, uniques) => {
		const filteredElement = Object.fromEntries(Object.entries(input).filter(([_, value]) => value !== undefined));
		const localType = (type ?? filteredElement.entityType) as string;
		const localNulls = nulls ?? Object.fromEntries(
			Object.keys(configs[localType]).map((
				e,
			) => [e, null]),
		);

		const mapped = {
			...localNulls,
			...filteredElement,
			entityType: localType,
		};

		const conflict = uniques
			? store.collection.find((e) => {
				if ((e as CommonEntity).entityType !== mapped.entityType) return false;
				for (const k of uniques) {
					if (k in mapped && !isEqual(mapped[k as keyof typeof mapped], e[k])) return false;
				}

				return true;
			})
			: findCompositeKey(store.collection as CommonEntity[], mapped as CommonEntity);
		if (conflict) {
			return { status: 'CONFLICT', data: conflict };
		}

		store.collection.push(mapped);

		return { status: 'OK', data: mapped };
	};
};

const generateList: (store: CollectionStore, type?: string) => ListFn<any> = (
	store,
	type,
) => {
	return (where) => {
		const from = type
			? filterCollection(store.collection, {
				entityType: type,
			})
			: store.collection;

		if (!where) return from;

		return (filterCollection(from, where));
	};
};

const generateOne: (store: CollectionStore, type?: string) => OneFn<any> = (
	store,
	type,
) => {
	return (where) => {
		const from = type
			? filterCollection(store.collection, {
				entityType: type,
			})
			: store.collection;

		if (!where) return from[0] ?? null;

		return (filterCollection(from, where)[0] ?? null);
	};
};

const generateUpdate: (store: CollectionStore, type?: string) => UpdateFn<any> = (
	store,
	type,
) => {
	return ({ set, where }) => {
		const filter = type
			? {
				...where,
				entityType: type,
			}
			: where;

		const targets = filter ? filterCollection(store.collection, filter) : store.collection;
		const entries = Object.entries(set);
		const newItems: {
			index: number;
			item: Record<string, any>;
		}[] = [];
		let i = 0;
		const dupes: Record<string, any>[] = [];

		for (const item of targets) {
			const newItem: Record<string, any> = { ...item };

			for (const [k, v] of entries) {
				if (!(k in item)) continue;
				const target = item[k];

				newItem[k] = typeof v === 'function'
					? (Array.isArray(target))
						? target.map(v)
						: v(target)
					: v;
			}

			const dupe = findCompositeKeys(store.collection as CommonEntity[], newItem as CommonEntity).filter((e) =>
				e !== item
			);

			dupes.push(...dupe.filter((e) => !dupes.find((d) => d === e)));

			if (!dupe.length) {
				newItems.push({
					item: newItem,
					index: i++,
				});
			}
		}

		// Swap this
		if (dupes.length) {
			return {
				status: 'CONFLICT',
				data: dupes,
			};
		}

		// ^ with this
		// If you want non-conflicting changes to apply regardless of conflicts' existence
		for (const { index, item } of newItems) {
			Object.assign(targets[index]!, item);
		}

		return { status: 'OK', data: targets };
	};
};

const generateDelete: (store: CollectionStore, type?: string) => DeleteFn<any> = (
	store,
	type,
) => {
	return (where) => {
		const updatedCollection = [] as Record<string, any>[];
		const deleted = [] as Record<string, any>[];

		const filter = type
			? {
				...where,
				entityType: type,
			}
			: where;

		if (!filter) {
			store.collection = updatedCollection;

			return deleted;
		}

		store.collection.forEach((e) => {
			if (matchesFilters(e, filter)) deleted.push(e);
			else updatedCollection.push(e);
		});

		store.collection = updatedCollection;

		return deleted;
	};
};

const generateHasDiff: (
	lengths: Record<string, number>,
) => HasDiffFn<any, any> = (
	lengths,
) => {
	return (input) => {
		const type = input.entityType;
		const length = lengths[type];

		return Object.keys(input).length > length;
	};
};

function validate(data: any, schema: Config, deep = false): boolean {
	if (typeof data !== 'object' || data === null) return false;

	for (const k of Array.from(new Set([...Object.keys(data), ...Object.keys(schema)]))) {
		if (!deep && k === 'entityType') continue;

		if (!schema[k]) return false;

		if (schema[k] === 'string[]') {
			if (!Array.isArray(data[k])) return false;

			if (!data[k].every((e) => typeof e === 'string')) return false;
		} else if (typeof schema[k] === 'string') {
			const isNullable = schema[k].endsWith('?');
			if (data[k] === null && !isNullable) return false;
			if (data[k] !== null && typeof data[k] !== removeQuestionMark(schema[k])) return false;
		} else if (Array.isArray(schema[k])) {
			if (typeof schema[k][0] === 'string') {
				if (!schema[k].some((e) => e === data[k])) return false;
			} else {
				if (!Array.isArray(data[k])) return false;
				if (
					!data[k].every(
						(e) => validate(e, (schema[k] as [Config])[0]),
						true,
					)
				) return false;
			}
		} else {
			if (data[k] !== null && !validate(data[k], schema[k], true)) return false;
		}
	}

	return true;
}

const generateValidate: (configs: Record<string, Config>, type?: string) => ValidateFn<any> = (
	configs,
	type,
) => {
	return ((data) => {
		if (typeof data !== 'object' || data === null) return false;

		const localType = type ?? (<any> data).entityType as string;
		if (typeof localType !== 'string' || (<any> data).entityType !== localType) return false;

		const config = configs[localType];
		if (!config) return false;

		return validate(data, config);
	}) as ValidateFn<any>;
};

type GenerateProcessors<
	T extends AnyDbConfig,
	TCommon extends boolean = false,
	TTypes extends Record<string, any> = T['types'],
> = {
	[K in keyof TTypes]: {
		push: PushFn<TTypes[K], TCommon>;
		list: ListFn<TTypes[K]>;
		one: OneFn<TTypes[K]>;
		update: UpdateFn<TTypes[K]>;
		delete: DeleteFn<TTypes[K]>;
		validate: ValidateFn<TTypes[K]>;
		hasDiff: HasDiffFn<T['definition'], K & string>;
	};
};

function initSchemaProcessors<T extends Omit<DbConfig<any>, 'diffs'>, TCommon extends boolean>(
	{ entities }: T,
	store: CollectionStore,
	common: TCommon,
	extraConfigs?: Record<string, Config>,
): GenerateProcessors<T, TCommon> {
	const entries = Object.entries(entities);

	// left, right, entityType, diffType
	const extraKeys = 4;

	const lengths: Record<string, number> = Object.fromEntries(
		Object.entries(common ? extraConfigs! : entities).map(([k, v]) => {
			// name, table?, schema?
			const commonCount = Object.keys(v).filter((e) => e in commonConfig).length;

			return [k, commonCount + extraKeys];
		}),
	);

	return Object.fromEntries(entries.map(([k, _v]) => {
		return [k, {
			push: generateInsert(common ? extraConfigs! : entities, store, common ? undefined : k),
			list: generateList(store, common ? undefined : k),
			one: generateOne(store, common ? undefined : k),
			update: generateUpdate(store, common ? undefined : k),
			delete: generateDelete(store, common ? undefined : k),
			validate: generateValidate(common ? extraConfigs! : entities, common ? undefined : k),
			hasDiff: generateHasDiff(lengths),
		}];
	})) as GenerateProcessors<T, TCommon>;
}

export type Config = {
	[K: string]: `${Exclude<DataType, 'string['>}?` | DataType | [string, ...string[]] | Config | [Config];
};

type DbConfig<TDefinition extends Definition> = {
	/** Type-level fields only, do not attempt to access at runtime */
	types: InferEntities<TDefinition>;
	/** Type-level fields only, do not attempt to access at runtime */
	definition: TDefinition;
	entities: {
		[K in keyof TDefinition]: Config;
	};
	diffs: {
		alter: {
			[K in keyof TDefinition | 'entities']: DiffAlter<TDefinition, K>;
		};
		create: {
			[K in keyof TDefinition | 'entities']: DiffCreate<TDefinition, K>;
		};
		drop: {
			[K in keyof TDefinition | 'entities']: DiffDrop<TDefinition, K>;
		};
		createdrop: {
			[K in keyof TDefinition | 'entities']: DiffCreate<TDefinition, K> | DiffDrop<TDefinition, K>;
		};
		all: {
			[K in keyof TDefinition | 'entities']: DiffStatement<TDefinition, K>;
		};
	};
	store: CollectionStore;
};

type AnyDbConfig = {
	/** Type-level fields only, do not attempt to access at runtime */
	types: Record<string, Record<string, any>>;
	entities: Record<string, Config>;
	definition: Record<string, any>;
};

type ValueOf<T> = T[keyof T];

export type DiffCreate<
	TSchema extends Definition = {},
	TType extends keyof TSchema | 'entities' = string,
	TShape extends Record<string, any> = TType extends 'entities' ? {} : Simplify<
		InferSchema<TSchema[TType]> & Omit<Common, keyof TSchema[TType]> & {
			entityType: TType;
		}
	>,
> = TType extends 'entities' ? ValueOf<
		{
			[K in keyof TSchema]: DiffCreate<TSchema, K>;
		}
	>
	: Simplify<
		& {
			$diffType: 'create';
			entityType: TType;
		}
		& {
			[
				K in keyof Common as K extends keyof TShape ? null extends TShape[K] ? never : K : K
			]: Exclude<Common[K], null>;
		}
		& Omit<TShape, keyof CommonEntity>
	>;

export type DiffDrop<
	TSchema extends Definition = {},
	TType extends keyof TSchema | 'entities' = string,
	TShape extends Record<string, any> = TType extends 'entities' ? {} : Simplify<
		InferSchema<TSchema[TType]> & Omit<Common, keyof TSchema[TType]> & {
			entityType: TType;
		}
	>,
> = TType extends 'entities' ? ValueOf<
		{
			[K in keyof TSchema]: DiffDrop<TSchema, K>;
		}
	>
	: Simplify<
		& {
			$diffType: 'drop';
			entityType: TType;
		}
		& {
			[
				K in keyof Common as K extends keyof TShape ? null extends TShape[K] ? never : K : K
			]: Exclude<Common[K], null>;
		}
		& Omit<TShape, keyof CommonEntity>
	>;

export type DiffAlter<
	TSchema extends Definition = {},
	TType extends keyof TSchema | 'entities' = string,
	TShape extends Record<string, any> = TType extends 'entities' ? {} : Simplify<
		InferSchema<TSchema[TType]> & Omit<Common, keyof TSchema[TType]> & {
			entityType: TType;
		}
	>,
	TFullShape extends Record<string, any> = TType extends 'entities' ? {} : Simplify<
		& InferSchema<TSchema[TType]>
		& {
			[C in keyof Common as C extends keyof TSchema[TType] ? never : null extends Common[C] ? never : C]: Common[C];
		}
		& {
			entityType: TType;
		}
	>,
> = TType extends 'entities' ? ValueOf<
		{
			[K in keyof TSchema]: DiffAlter<TSchema, K>;
		}
	>
	: Simplify<
		& {
			$diffType: 'alter';
			entityType: TType;
		}
		& {
			[
				K in keyof Common as K extends keyof TShape ? null extends TShape[K] ? never : K : K
			]: Exclude<Common[K], null>;
		}
		& {
			[K in Exclude<keyof TShape, keyof CommonEntity>]?: {
				from: TShape[K];
				to: TShape[K];
			};
		}
		& {
			$left: TFullShape;
			$right: TFullShape;
		}
	>;

export type DiffStatement<
	TSchema extends Definition,
	TType extends keyof TSchema | 'entities',
> =
	| DiffCreate<TSchema, TType>
	| DiffDrop<TSchema, TType>
	| DiffAlter<TSchema, TType>;

type CollectionRow = Record<string, any> & Common & {
	entityType: string;
	key: string;
};

const ignoreChanges: Record<keyof Common | 'entityType', true> = {
	entityType: true,
	name: true,
	schema: true,
	table: true,
};

function isEqual(a: any, b: any): boolean {
	if (typeof a !== typeof b) return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => isEqual(v, b[i]));
	}

	if (typeof a === 'object') {
		if (a === b) return true;
		if ((a === null || b === null) && a !== b) return false;

		const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));

		return keys.every((k) => isEqual(a[k], b[k]));
	}

	return a === b;
}

function sanitizeRow(row: Record<string, any>) {
	return Object.fromEntries(
		Object.entries(row).filter(([k, _v]) => !ignoreChanges[k as keyof typeof ignoreChanges]),
	);
}

function getRowCommons(row: Record<string, any>): {
	[K in keyof Common]: Common[K];
} {
	const res: Record<string, any> = {};
	for (const k of Object.keys(commonConfig)) {
		if (row[k] === undefined || row[k] === null) continue;

		res[k] = row[k];
	}

	return res as any;
}

function _diff<
	TDefinition extends Definition,
	TCollection extends keyof TDefinition | 'entities' = 'entities',
	TMode extends 'all' | 'create' | 'drop' | 'createdrop' | 'alter' = 'all',
	TDataBase extends SimpleDb<TDefinition> = SimpleDb<TDefinition>,
>(
	dbOld: SimpleDb<TDefinition>,
	dbNew: SimpleDb<TDefinition>,
	collection?: TCollection,
	mode?: TMode,
): Simplify<TDataBase['_']['diffs'][TMode][TCollection]>[] {
	collection = collection ?? 'entities' as TCollection;
	mode = mode ?? 'all' as TMode;

	const leftEntities = dbOld.entities.list(
		collection === 'entities' ? undefined : {
			// @ts-ignore
			entityType: collection,
		},
	) as CollectionRow[];
	const rightEntities = dbNew.entities.list(
		collection === 'entities' ? undefined : {
			// @ts-ignore
			entityType: collection,
		},
	) as CollectionRow[];

	const left: Record<string, CollectionRow> = {};
	const right: Record<string, CollectionRow> = {};

	for (const row of leftEntities) {
		left[getCompositeKey(row)] = row;
	}
	for (const row of rightEntities) {
		right[getCompositeKey(row)] = row;
	}

	const created: DiffCreate[] = [];
	const dropped: DiffDrop[] = [];
	const altered: DiffAlter[] = [];

	for (const [key, oldRow] of Object.entries(left)) {
		const newRow = right[key];
		if (!newRow) {
			if (mode === 'all' || mode === 'drop' || mode === 'createdrop') {
				dropped.push({
					$diffType: 'drop',
					entityType: oldRow.entityType,
					...getRowCommons(oldRow),
					...sanitizeRow(oldRow),
				});
			}
		} else if (mode === 'all' || mode === 'alter') {
			const changes: Record<string, any> = {};
			let isChanged = false;

			for (const [k, _v] of Object.entries(oldRow)) {
				if (ignoreChanges[k as keyof typeof ignoreChanges]) continue;

				if (!isEqual(oldRow[k], newRow[k])) {
					isChanged = true;
					changes[k] = { from: oldRow[k], to: newRow[k] };
				}
			}

			if (isChanged) {
				altered.push({
					$diffType: 'alter',
					entityType: newRow.entityType,
					...getRowCommons(newRow),
					...changes,
					$left: oldRow,
					$right: newRow,
				});
			}
		}

		delete right[key];
	}

	if (mode === 'all' || mode === 'create' || mode === 'createdrop') {
		for (const newRow of Object.values(right)) {
			created.push({
				$diffType: 'create',
				entityType: newRow.entityType as string,
				...getRowCommons(newRow),
				...sanitizeRow(newRow),
			});
		}
	}

	return [...created, ...dropped, ...altered] as any;
}

export function diff<
	TDefinition extends Definition,
	TCollection extends keyof TDefinition | 'entities' = 'entities',
>(dbOld: SimpleDb<TDefinition>, dbNew: SimpleDb<TDefinition>, collection?: TCollection) {
	return _diff(dbOld, dbNew, collection, 'createdrop');
}

export namespace diff {
	export function all<
		TDefinition extends Definition,
		TCollection extends keyof TDefinition | 'entities' = 'entities',
	>(dbOld: SimpleDb<TDefinition>, dbNew: SimpleDb<TDefinition>, collection?: TCollection) {
		return _diff(dbOld, dbNew, collection, 'all');
	}

	export function creates<
		TDefinition extends Definition,
		TCollection extends keyof TDefinition | 'entities' = 'entities',
	>(dbOld: SimpleDb<TDefinition>, dbNew: SimpleDb<TDefinition>, collection?: TCollection) {
		return _diff(dbOld, dbNew, collection, 'create');
	}

	export function drops<
		TDefinition extends Definition,
		TCollection extends keyof TDefinition | 'entities' = 'entities',
	>(dbOld: SimpleDb<TDefinition>, dbNew: SimpleDb<TDefinition>, collection?: TCollection) {
		return _diff(dbOld, dbNew, collection, 'drop');
	}

	export function alters<
		TDefinition extends Definition,
		TCollection extends keyof TDefinition | 'entities' = 'entities',
	>(dbOld: SimpleDb<TDefinition>, dbNew: SimpleDb<TDefinition>, collection?: TCollection) {
		return _diff(dbOld, dbNew, collection, 'alter');
	}
}

function removeQuestionMark<T extends string, TResult extends string = T extends `${infer R}?` ? R : T>(
	str: T,
): TResult {
	if (!str.endsWith('?')) return str as string as TResult;

	return str.slice(0, str.length - 1) as TResult;
}

class SimpleDb<TDefinition extends Definition = Record<string, any>> {
	public readonly _: DbConfig<TDefinition> = {
		diffs: {} as any,
		store: {
			collection: [] as Record<string, any>[],
		},
	} as any;

	public entities: GenerateProcessors<{
		types: {
			entities: InferEntities<TDefinition> extends infer TInferred ? Simplify<
					ValueOf<TInferred>
				>
				: never;
		};
		entities: any;
		definition: TDefinition;
	}, true>['entities'];

	constructor(definition: TDefinition) {
		const entries = Object.entries(definition);
		const configs = Object.fromEntries(entries.map(([type, def]) => {
			if (type === 'entities' || type === '_') throw new Error(`Illegal entity type name: "${type}"`);
			const cloneDef: Record<string, any> = {};

			Object.entries(def).forEach(([fieldName, fieldValue]) => {
				cloneDef[fieldName] = fieldValue;

				if (fieldValue === 'required') {
					if (!(fieldName in commonConfig)) {
						throw new Error(
							`Type value "required" is only applicable to common keys [ ${
								Object.keys(commonConfig).map((e) => `"${e}"`).join(', ')
							} ], used on: "${fieldName}"`,
						);
					}

					cloneDef[fieldName] = (removeQuestionMark(commonConfig[fieldName] as string)) as Exclude<
						ExtendedType,
						'required'
					>;
				} else {
					if (fieldName in commonConfig) {
						throw new Error(`Used forbidden key "${fieldName}" in entity "${type}"`);
					}
				}
			});

			for (const k in commonConfig) {
				if (commonConfig[k].endsWith('?')) continue;

				cloneDef[k] = commonConfig[k];
			}

			return [type, cloneDef];
		}));

		this._.entities = configs as any;

		const entConfig = {
			...this._,
			entities: {
				entities: commonConfig,
			},
		};

		this.entities = initSchemaProcessors(entConfig, this._.store, true, this._.entities).entities as any;
	}
}

export function create<
	TDefinition extends Definition,
	TResult = SimpleDb<TDefinition> extends infer DB extends SimpleDb<any> ? Simplify<DB & GenerateProcessors<DB['_']>>
		: never,
>(
	definition: TDefinition,
): TResult {
	const db = new SimpleDb(definition);

	const processors = initSchemaProcessors(db._, db._.store, false);
	for (const [k, v] of Object.entries(processors)) {
		(db as any)[k] = v;
	}

	return db as any;
}
