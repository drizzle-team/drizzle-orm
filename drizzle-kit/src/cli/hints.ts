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
	{ kind: 'default', schema: tripleTupleSchema },
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

export type PromptEntityType = RenameCreateHintKind;

type RenameCreateSchemaFor<K extends RenameCreateHintKind> = Extract<
	typeof renameCreateEntitySchemas[number],
	{ kind: K }
>['schema'];

type ConfirmSchemaFor<K extends ConfirmEntityKind> = Extract<
	typeof confirmEntitySchemas[number],
	{ kind: K }
>['schema'];

export type IdFor<K extends PromptEntityType> = Readonly<z.infer<RenameCreateSchemaFor<K>>>;

export type ConfirmIdFor<K extends ConfirmEntityKind> = Readonly<z.infer<ConfirmSchemaFor<K>>>;

export type RenameHint = {
	[K in PromptEntityType]: { type: 'rename'; kind: K; from: IdFor<K>; to: IdFor<K> };
}[PromptEntityType];

export type CreateHint = {
	[K in PromptEntityType]: { type: 'create'; kind: K; entity: IdFor<K> };
}[PromptEntityType];

export type ConfirmDataLossHint = {
	[K in ConfirmEntityKind]: { type: 'confirm_data_loss'; kind: K; entity: ConfirmIdFor<K> };
}[ConfirmEntityKind];

export type Hint = RenameHint | CreateHint | ConfirmDataLossHint;

type RenameCreateMissingHint<K extends RenameCreateHintKind> = {
	type: 'rename_or_create';
	kind: K;
	entity: IdFor<K>;
};

type ConfirmDataLossReasonDetails =
	| { reason: 'non_empty' }
	| { reason: 'nulls_present' }
	| { reason: 'duplicates_present' }
	| { reason: 'type_change'; reason_details: { from: string; to: string } };

type ConfirmDataLossMissingHint<K extends ConfirmEntityKind> = {
	type: 'confirm_data_loss';
	kind: K;
	entity: ConfirmIdFor<K>;
} & ConfirmDataLossReasonDetails;

export type MissingHint =
	| {
		[K in PromptEntityType]: RenameCreateMissingHint<K>;
	}[PromptEntityType]
	| {
		[K in ConfirmEntityKind]: ConfirmDataLossMissingHint<K>;
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
	renameCreateEntitySchemas.map(({ kind, schema }) =>
		z.object({
			type: z.literal('rename'),
			kind: z.literal(kind),
			from: schema,
			to: schema,
		}).strict()
	) as unknown as UnionInput<RenameHintMembers>,
);

const createHintSchema = z.union(
	renameCreateEntitySchemas.map(({ kind, schema }) =>
		z.object({
			type: z.literal('create'),
			kind: z.literal(kind),
			entity: schema,
		}).strict()
	) as unknown as UnionInput<CreateHintMembers>,
);

const confirmHintSchema = z.union(
	confirmEntitySchemas.map(({ kind, schema }) =>
		z.object({
			type: z.literal('confirm_data_loss'),
			kind: z.literal(kind),
			entity: schema,
		}).strict()
	) as unknown as UnionInput<ConfirmHintMembers>,
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
			} catch (error) {
				throw new InvalidHintsCliError(
					`Failed to read hints file '${opts.hintsFile}': ${(error as Error).message}`,
					{ source, path: opts.hintsFile },
					{ cause: error as Error },
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
		} catch (error) {
			throw new InvalidHintsCliError(
				`Failed to parse hints JSON from ${source}: ${(error as Error).message}`,
				{ source },
				{ cause: error as Error },
			);
		}

		try {
			return new HintsHandler(parseHints(parsedJson));
		} catch (error) {
			if (error instanceof InvalidHintShapeCliError) {
				throw new InvalidHintsCliError(
					error.message,
					{ source, issues: error.meta.issues as unknown as JsonValue },
					{ cause: error },
				);
			}

			throw error;
		}
	}

	matchRename<K extends PromptEntityType>(kind: K, toId: IdFor<K>) {
		return this.userHints.renames.find((hint): hint is Extract<RenameHint, { kind: K }> => {
			return hint.kind === kind && tuplesEqual(hint.to, toId);
		});
	}

	matchCreate<K extends PromptEntityType>(kind: K, entityId: IdFor<K>) {
		return this.userHints.creates.find((hint): hint is Extract<CreateHint, { kind: K }> => {
			return hint.kind === kind && tuplesEqual(hint.entity, entityId);
		});
	}

	matchConfirm<K extends ConfirmEntityKind>(kind: K, entityId: ConfirmIdFor<K>) {
		return this.userHints.confirms.find((hint): hint is Extract<ConfirmDataLossHint, { kind: K }> => {
			return hint.kind === kind && tuplesEqual(hint.entity, entityId);
		});
	}

	pushMissingHint(hint: MissingHint): void {
		this.missingHints.push(hint);
	}

	hasMissingHints(): boolean {
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
