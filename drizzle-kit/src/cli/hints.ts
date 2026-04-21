import { readFile } from 'fs/promises';
import { z, type ZodIssue } from 'zod';
import { InvalidHintsCliError, type JsonValue } from './errors';

const singleTupleSchema = z.tuple([z.string()]);
const pairTupleSchema = z.tuple([z.string(), z.string()]);
const tripleTupleSchema = z.tuple([z.string(), z.string(), z.string()]);
const privilegeTupleSchema = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]);

const renameCreateEntitySchemas = [
	{ kind: 'table', schema: pairTupleSchema },
	{ kind: 'column', schema: tripleTupleSchema },
	{ kind: 'schema', schema: singleTupleSchema },
	{ kind: 'enum', schema: pairTupleSchema },
	{ kind: 'sequence', schema: pairTupleSchema },
	{ kind: 'view', schema: pairTupleSchema },
	{ kind: 'policy', schema: tripleTupleSchema },
	{ kind: 'role', schema: singleTupleSchema },
	{ kind: 'privilege', schema: privilegeTupleSchema },
	{ kind: 'check', schema: tripleTupleSchema },
	{ kind: 'index', schema: tripleTupleSchema },
	{ kind: 'unique', schema: tripleTupleSchema },
	{ kind: 'primary key', schema: tripleTupleSchema },
	{ kind: 'foreign key', schema: tripleTupleSchema },
] as const satisfies readonly { readonly kind: string; readonly schema: z.ZodTypeAny }[];

export type RenameCreateHintKind = typeof renameCreateEntitySchemas[number]['kind'];

const confirmEntitySchemas = [
	{ kind: 'table', schema: pairTupleSchema },
	{ kind: 'column', schema: tripleTupleSchema },
	{ kind: 'schema', schema: singleTupleSchema },
	{ kind: 'view', schema: pairTupleSchema },
	{ kind: 'primary_key', schema: tripleTupleSchema },
	{ kind: 'add_not_null', schema: tripleTupleSchema },
	{ kind: 'add_unique', schema: tripleTupleSchema },
] as const satisfies readonly { readonly kind: string; readonly schema: z.ZodTypeAny }[];

export type ConfirmEntityKind = typeof confirmEntitySchemas[number]['kind'];

export type PromptEntityType = RenameCreateHintKind | 'default';

type RenameCreateSchemaFor<K extends RenameCreateHintKind> = Extract<
	typeof renameCreateEntitySchemas[number],
	{ kind: K }
>['schema'];

type ConfirmSchemaFor<K extends ConfirmEntityKind> = Extract<
	typeof confirmEntitySchemas[number],
	{ kind: K }
>['schema'];

export type IdFor<K extends RenameCreateHintKind> = Readonly<z.infer<RenameCreateSchemaFor<K>>>;

export type ConfirmIdFor<K extends ConfirmEntityKind> = Readonly<z.infer<ConfirmSchemaFor<K>>>;

export type RenameHint = {
	[K in RenameCreateHintKind]: { type: 'rename'; kind: K; from: IdFor<K>; to: IdFor<K> };
}[RenameCreateHintKind];

export type CreateHint = {
	[K in RenameCreateHintKind]: { type: 'create'; kind: K; entity: IdFor<K> };
}[RenameCreateHintKind];

export type ConfirmDataLossHint = {
	[K in ConfirmEntityKind]: { type: 'confirm_data_loss'; kind: K; entity: ConfirmIdFor<K> };
}[ConfirmEntityKind];

export type Hint = RenameHint | CreateHint | ConfirmDataLossHint;

export type MissingHint =
	| {
		[K in RenameCreateHintKind]: { type: 'rename_or_create'; kind: K; entity: IdFor<K> };
	}[RenameCreateHintKind]
	| {
		[K in ConfirmEntityKind]: {
			type: 'confirm_data_loss';
			kind: K;
			entity: ConfirmIdFor<K>;
			reason: 'non_empty' | 'nulls_present' | 'duplicates_present';
		};
	}[ConfirmEntityKind];

export type MissingHintsResponse = {
	status: 'missing_hints';
	unresolved: readonly MissingHint[];
};

type Hints = {
	renames: RenameHint[];
	creates: CreateHint[];
	confirms: ConfirmDataLossHint[];
};

type InvalidHintShapeCliErrorMeta = {
	issues: readonly ZodIssue[];
};

type RenameHintMember<E> = E extends { kind: infer K extends string; schema: infer S extends z.ZodTypeAny }
	? z.ZodObject<{
		type: z.ZodLiteral<'rename'>;
		kind: z.ZodLiteral<K>;
		from: S;
		to: S;
	}, 'strict'>
	: never;

type CreateHintMember<E> = E extends { kind: infer K extends string; schema: infer S extends z.ZodTypeAny }
	? z.ZodObject<{
		type: z.ZodLiteral<'create'>;
		kind: z.ZodLiteral<K>;
		entity: S;
	}, 'strict'>
	: never;

type ConfirmHintMember<E> = E extends { kind: infer K extends string; schema: infer S extends z.ZodTypeAny }
	? z.ZodObject<{
		type: z.ZodLiteral<'confirm_data_loss'>;
		kind: z.ZodLiteral<K>;
		entity: S;
	}, 'strict'>
	: never;

type RenameHintMembers = {
	-readonly [I in keyof typeof renameCreateEntitySchemas]: RenameHintMember<typeof renameCreateEntitySchemas[I]>;
};

type CreateHintMembers = {
	-readonly [I in keyof typeof renameCreateEntitySchemas]: CreateHintMember<typeof renameCreateEntitySchemas[I]>;
};

type ConfirmHintMembers = {
	-readonly [I in keyof typeof confirmEntitySchemas]: ConfirmHintMember<typeof confirmEntitySchemas[I]>;
};

type UnionInput<T extends readonly z.ZodTypeAny[]> = T & [T[number], T[number], ...T[number][]];

const renameHintSchema = z.union(
	(renameCreateEntitySchemas.map(({ kind, schema }) =>
		z.object({
			type: z.literal('rename'),
			kind: z.literal(kind),
			from: schema,
			to: schema,
		}).strict()
	) as unknown as RenameHintMembers) as UnionInput<RenameHintMembers>,
);

const createHintSchema = z.union(
	(renameCreateEntitySchemas.map(({ kind, schema }) =>
		z.object({
			type: z.literal('create'),
			kind: z.literal(kind),
			entity: schema,
		}).strict()
	) as unknown as CreateHintMembers) as UnionInput<CreateHintMembers>,
);

const confirmHintSchema = z.union(
	(confirmEntitySchemas.map(({ kind, schema }) =>
		z.object({
			type: z.literal('confirm_data_loss'),
			kind: z.literal(kind),
			entity: schema,
		}).strict()
	) as unknown as ConfirmHintMembers) as UnionInput<ConfirmHintMembers>,
);

const hintSchema = z.array(z.union([
	renameHintSchema,
	createHintSchema,
	confirmHintSchema,
]));

export class InvalidHintShapeCliError extends Error {
	readonly code = 'invalid_hints' as const;
	readonly meta: InvalidHintShapeCliErrorMeta;

	constructor(meta: InvalidHintShapeCliErrorMeta) {
		const [issue] = meta.issues;
		const location = formatIssuePath(issue?.path ?? []);

		super(issue ? `Invalid hint shape at ${location}: ${issue.message}` : 'Invalid hint shape');
		this.name = new.target.name;
		this.meta = meta;
	}
}

export class HintsHandler {
	private readonly userHints: Hints;
	readonly missingHints: MissingHint[] = [];

	constructor(hints: readonly Hint[] = []) {
		this.userHints = buildHints(hints);
	}

	static async fromCli(opts: { hints?: string; hintsFile?: string }): Promise<HintsHandler> {
		let source: 'file' | 'inline' | 'none';
		let rawText: string;

		if (opts.hintsFile) {
			source = 'file';
			try {
				rawText = await readFile(opts.hintsFile, 'utf8');
			} catch (cause) {
				throw new InvalidHintsCliError(
					`Failed to read hints file '${opts.hintsFile}': ${(cause as Error).message}`,
					{ source, path: opts.hintsFile },
					{ cause: cause as Error },
				);
			}
		} else if (opts.hints) {
			source = 'inline';
			rawText = opts.hints;
		} else {
			return new HintsHandler();
		}

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(rawText);
		} catch (cause) {
			throw new InvalidHintsCliError(
				`Failed to parse hints JSON from ${source}: ${(cause as Error).message}`,
				{ source },
				{ cause: cause as Error },
			);
		}

		try {
			return new HintsHandler(parseHints(parsedJson));
		} catch (cause) {
			if (cause instanceof InvalidHintShapeCliError) {
				throw new InvalidHintsCliError(
					cause.message,
					{ source, issues: cause.meta.issues as unknown as JsonValue },
					{ cause },
				);
			}

			throw cause;
		}
	}

	matchRename<K extends RenameCreateHintKind>(kind: K, toId: IdFor<K>) {
		return this.userHints.renames.find((hint): hint is Extract<RenameHint, { kind: K }> => {
			return hint.kind === kind && tuplesEqual(hint.to, toId);
		});
	}

	matchCreate<K extends RenameCreateHintKind>(kind: K, entityId: IdFor<K>) {
		return this.userHints.creates.find((hint): hint is Extract<CreateHint, { kind: K }> => {
			return hint.kind === kind && tuplesEqual(hint.entity, entityId);
		});
	}

	matchConfirm<K extends ConfirmEntityKind>(kind: K, entityId: ConfirmIdFor<K>) {
		return this.userHints.confirms.find((hint): hint is Extract<ConfirmDataLossHint, { kind: K }> => {
			return hint.kind === kind && tuplesEqual(hint.entity, entityId);
		});
	}

	pushMissingHint<K extends RenameCreateHintKind>(hint: { type: 'rename_or_create'; kind: K; entity: IdFor<K> }): void;
	pushMissingHint<K extends ConfirmEntityKind>(hint: {
		type: 'confirm_data_loss';
		kind: K;
		entity: ConfirmIdFor<K>;
		reason: 'non_empty' | 'nulls_present' | 'duplicates_present';
	}): void;
	pushMissingHint(
		hint:
			| { type: 'rename_or_create'; kind: RenameCreateHintKind; entity: Readonly<readonly string[]> }
			| {
				type: 'confirm_data_loss';
				kind: ConfirmEntityKind;
				entity: Readonly<readonly string[]>;
				reason: 'non_empty' | 'nulls_present' | 'duplicates_present';
			},
	): void {
		this.missingHints.push(hint as MissingHint);
	}

	hasUnresolved(): boolean {
		return this.missingHints.length > 0;
	}

	emitAndExit(): never {
		process.stdout.write(JSON.stringify(this.toResponse()) + '\n');
		process.exit(2);
	}

	toResponse(): MissingHintsResponse {
		return {
			status: 'missing_hints',
			unresolved: this.missingHints,
		};
	}
}

function formatIssuePath(path: readonly (string | number)[]): string {
	if (path.length === 0) {
		return '<root>';
	}

	return path.map((segment) => typeof segment === 'number' ? `[${segment}]` : `.${segment}`).join('');
}

function parseHints(raw: unknown): Hint[] {
	const result = hintSchema.safeParse(raw);
	if (!result.success) {
		throw new InvalidHintShapeCliError({ issues: result.error.issues });
	}

	return result.data;
}

function buildHints(hints: readonly Hint[]): Hints {
	const set: Hints = {
		renames: [],
		creates: [],
		confirms: [],
	};

	for (const hint of hints) {
		if (hint.type === 'rename') {
			set.renames.push(hint);
			continue;
		}

		if (hint.type === 'create') {
			set.creates.push(hint);
			continue;
		}

		set.confirms.push(hint);
	}

	return set;
}

function tuplesEqual(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((segment, index) => segment === right[index]);
}

export const supportedRenameCreateHintKinds = renameCreateEntitySchemas.map((entry) => entry.kind);
