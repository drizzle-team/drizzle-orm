import { readFile } from 'fs/promises';
import { z, type ZodIssue } from 'zod';
import { InvalidHintsCliError, type JsonValue } from './errors';

const schemaTupleSchema = z.tuple([z.string()]);
const pairTupleSchema = z.tuple([z.string(), z.string()]);
const tripleTupleSchema = z.tuple([z.string(), z.string(), z.string()]);
const privilegeTupleSchema = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]);

const hintEntities = [
	'table',
	'column',
	'schema',
	'enum',
	'sequence',
	'view',
	'policy',
	'role',
	'privilege',
	'check',
	'index',
	'unique',
	'primary_key',
	'foreign_key',
] as const;

export type HintEntityKind = typeof hintEntities[number];

const confirmEntities = [
	'table',
	'column',
	'schema',
	'view',
	'primary_key',
	'add_not_null',
	'add_unique',
] as const;

export type ConfirmEntityKind = typeof confirmEntities[number];

const hintEntitySchemas = {
	table: pairTupleSchema,
	column: tripleTupleSchema,
	schema: schemaTupleSchema,
	enum: pairTupleSchema,
	sequence: pairTupleSchema,
	view: pairTupleSchema,
	policy: tripleTupleSchema,
	role: schemaTupleSchema,
	privilege: privilegeTupleSchema,
	check: tripleTupleSchema,
	index: tripleTupleSchema,
	unique: tripleTupleSchema,
	primary_key: tripleTupleSchema,
	foreign_key: tripleTupleSchema,
} satisfies Record<HintEntityKind, z.ZodTypeAny>;

const confirmEntitySchemas = {
	table: pairTupleSchema,
	column: tripleTupleSchema,
	schema: schemaTupleSchema,
	view: pairTupleSchema,
	primary_key: tripleTupleSchema,
	add_not_null: tripleTupleSchema,
	add_unique: tripleTupleSchema,
} satisfies Record<ConfirmEntityKind, z.ZodTypeAny>;

type KindIds = {
	[K in HintEntityKind]: Readonly<z.infer<(typeof hintEntitySchemas)[K]>>;
};

type ConfirmIds = {
	[K in ConfirmEntityKind]: Readonly<z.infer<(typeof confirmEntitySchemas)[K]>>;
};

export type IdFor<K extends HintEntityKind> = KindIds[K];

export type ConfirmIdFor<K extends ConfirmEntityKind> = ConfirmIds[K];

export type RenameHint = {
	[K in HintEntityKind]: { type: 'rename'; kind: K; from: IdFor<K>; to: IdFor<K> };
}[HintEntityKind];

export type CreateHint = {
	[K in HintEntityKind]: { type: 'create'; kind: K; entity: IdFor<K> };
}[HintEntityKind];

export type ConfirmDataLossHint = {
	[K in ConfirmEntityKind]: { type: 'confirm_data_loss'; kind: K; entity: ConfirmIdFor<K> };
}[ConfirmEntityKind];

export type Hint = RenameHint | CreateHint | ConfirmDataLossHint;

export type MissingHint =
	| {
		[K in HintEntityKind]: { type: 'rename_or_create'; kind: K; entity: IdFor<K> };
	}[HintEntityKind]
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
	renames: Map<string, RenameHint>;
	creates: Map<string, CreateHint>;
	confirms: Map<string, ConfirmDataLossHint>;
};

type InvalidHintShapeCliErrorMeta = {
	issues: readonly ZodIssue[];
};

const renameHintInputSchema = z.object({
	type: z.literal('rename'),
	kind: z.enum(hintEntities),
	from: z.array(z.string()),
	to: z.array(z.string()),
}).strict();

const createHintInputSchema = z.object({
	type: z.literal('create'),
	kind: z.enum(hintEntities),
	entity: z.array(z.string()),
}).strict();

const confirmHintInputSchema = z.object({
	type: z.literal('confirm_data_loss'),
	kind: z.enum(confirmEntities),
	entity: z.array(z.string()),
}).strict();

const hintSchema = z.array(z.discriminatedUnion('type', [
	renameHintInputSchema,
	createHintInputSchema,
	confirmHintInputSchema,
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

	matchRename<K extends HintEntityKind>(kind: K, toId: IdFor<K>) {
		return this.userHints.renames.get(keyFor(kind, toId)) as Extract<RenameHint, { kind: K }> | undefined;
	}

	matchCreate<K extends HintEntityKind>(kind: K, entityId: IdFor<K>) {
		return this.userHints.creates.get(keyFor(kind, entityId)) as Extract<CreateHint, { kind: K }> | undefined;
	}

	matchConfirm<K extends ConfirmEntityKind>(kind: K, entityId: ConfirmIdFor<K>) {
		return this.userHints.confirms.get(keyFor(kind, entityId)) as Extract<ConfirmDataLossHint, { kind: K }> | undefined;
	}

	pushMissingHint<K extends HintEntityKind>(hint: { type: 'rename_or_create'; kind: K; entity: IdFor<K> }): void;
	pushMissingHint<K extends ConfirmEntityKind>(hint: {
		type: 'confirm_data_loss';
		kind: K;
		entity: ConfirmIdFor<K>;
		reason: 'non_empty' | 'nulls_present' | 'duplicates_present';
	}): void;
	pushMissingHint(hint: MissingHint): void {
		this.missingHints.push(hint);
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

	const issues: ZodIssue[] = [];
	const hints: Hint[] = [];

	const collect = (
		parseResult: z.SafeParseReturnType<unknown, readonly string[]>,
		path: readonly (string | number)[],
	): boolean => {
		if (parseResult.success) return true;
		for (const issue of parseResult.error.issues) {
			issues.push({ ...issue, path: [...path, ...issue.path] });
		}
		return false;
	};

	result.data.forEach((hint, index) => {
		if (hint.type === 'rename') {
			const tupleSchema = hintEntitySchemas[hint.kind];
			const fromResult = tupleSchema.safeParse(hint.from);
			const toResult = tupleSchema.safeParse(hint.to);
			const fromOk = collect(fromResult, [index, 'from']);
			const toOk = collect(toResult, [index, 'to']);
			if (fromOk && toOk) {
				hints.push({
					type: 'rename',
					kind: hint.kind,
					from: fromResult.data as IdFor<typeof hint.kind>,
					to: toResult.data as IdFor<typeof hint.kind>,
				} as RenameHint);
			}
			return;
		}

		if (hint.type === 'create') {
			const entityResult = hintEntitySchemas[hint.kind].safeParse(hint.entity);
			if (collect(entityResult, [index, 'entity'])) {
				hints.push({
					type: 'create',
					kind: hint.kind,
					entity: entityResult.data as IdFor<typeof hint.kind>,
				} as CreateHint);
			}
			return;
		}

		const entityResult = confirmEntitySchemas[hint.kind].safeParse(hint.entity);
		if (collect(entityResult, [index, 'entity'])) {
			hints.push({
				type: 'confirm_data_loss',
				kind: hint.kind,
				entity: entityResult.data as ConfirmIdFor<typeof hint.kind>,
			} as ConfirmDataLossHint);
		}
	});

	if (issues.length > 0) {
		throw new InvalidHintShapeCliError({ issues });
	}

	return hints;
}

function buildHints(hints: readonly Hint[]): Hints {
	const set: Hints = {
		renames: new Map(),
		creates: new Map(),
		confirms: new Map(),
	};

	for (const hint of hints) {
		if (hint.type === 'rename') {
			set.renames.set(keyFor(hint.kind, hint.to), hint);
			continue;
		}

		if (hint.type === 'create') {
			set.creates.set(keyFor(hint.kind, hint.entity), hint);
			continue;
		}

		set.confirms.set(keyFor(hint.kind, hint.entity), hint);
	}

	return set;
}

function keyFor(kind: string, tuple: readonly string[]): string {
	return `${kind}|${tuple.join('|')}`;
}
