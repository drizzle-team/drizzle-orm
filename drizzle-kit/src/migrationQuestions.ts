import { array, literal, object, string, union } from 'zod';

export type GenerateMigrationQuestionKind =
	| 'column'
	| 'enum'
	| 'policy'
	| 'role'
	| 'schema'
	| 'sequence'
	| 'table'
	| 'view';

export type GenerateMigrationRef = {
	name: string;
	schema?: string;
};

export type GenerateMigrationChoice =
	| { type: 'create' }
	| { type: 'rename'; from: GenerateMigrationRef };

export type GenerateMigrationQuestion = {
	id: string;
	kind: GenerateMigrationQuestionKind;
	to: GenerateMigrationRef;
	table?: GenerateMigrationRef;
	choices: GenerateMigrationChoice[];
	answer?: GenerateMigrationChoice;
};

export type GenerateMigrationQuestions = {
	version: 1;
	questions: GenerateMigrationQuestion[];
};

const generateMigrationRefSchema = object({
	name: string(),
	schema: string().optional(),
}).strict();

const generateMigrationChoiceSchema = union([
	object({
		type: literal('create'),
	}).strict(),
	object({
		type: literal('rename'),
		from: generateMigrationRefSchema,
	}).strict(),
]);

const generateMigrationQuestionSchema = object({
	id: string(),
	kind: union([
		literal('column'),
		literal('enum'),
		literal('policy'),
		literal('role'),
		literal('schema'),
		literal('sequence'),
		literal('table'),
		literal('view'),
	]),
	to: generateMigrationRefSchema,
	table: generateMigrationRefSchema.optional(),
	choices: array(generateMigrationChoiceSchema),
	answer: generateMigrationChoiceSchema.optional(),
}).strict();

const generateMigrationQuestionsSchema = object({
	version: literal(1),
	questions: array(generateMigrationQuestionSchema),
}).strict();

const generateMigrationQuestionsInputSchema = union([
	generateMigrationQuestionsSchema,
	array(generateMigrationQuestionSchema),
]);

const schemaAwareKinds = new Set<GenerateMigrationQuestionKind>([
	'enum',
	'sequence',
	'table',
	'view',
]);

const normalizeSchema = (schema?: string) => {
	return schema || 'public';
};

const refKey = (ref: GenerateMigrationRef) => {
	return ref.schema ? `${ref.schema}.${ref.name}` : ref.name;
};

export const parseGenerateMigrationQuestions = (
	input: unknown,
): GenerateMigrationQuestions => {
	const parsed = generateMigrationQuestionsInputSchema.parse(input);

	if (Array.isArray(parsed)) {
		return {
			version: 1,
			questions: parsed,
		};
	}

	return parsed;
};

export const normalizeGenerateMigrationRef = (
	kind: GenerateMigrationQuestionKind,
	ref: GenerateMigrationRef,
): GenerateMigrationRef => {
	if (!schemaAwareKinds.has(kind)) {
		return { name: ref.name };
	}

	return {
		name: ref.name,
		schema: normalizeSchema(ref.schema),
	};
};

export const createGenerateMigrationQuestionId = (
	kind: GenerateMigrationQuestionKind,
	to: GenerateMigrationRef,
	table?: GenerateMigrationRef,
) => {
	if (kind === 'column' || kind === 'policy') {
		if (!table) {
			throw new Error(`"${kind}" questions require table context`);
		}
		return `${kind}:${refKey(table)}:${to.name}`;
	}

	return `${kind}:${refKey(to)}`;
};

export class GenerateMigrationQuestionsError extends Error {
	readonly questions: GenerateMigrationQuestions;

	constructor(questions: GenerateMigrationQuestions) {
		const unresolved = questions.questions.filter((it) => !it.answer).length;
		super(`Missing answers for ${unresolved} migration conflict${unresolved === 1 ? '' : 's'}`);
		this.name = 'GenerateMigrationQuestionsError';
		this.questions = questions;
	}
}
