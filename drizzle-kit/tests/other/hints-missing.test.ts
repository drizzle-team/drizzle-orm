import { HintsHandler } from 'src/cli/hints';
import { setJsonMode } from 'src/cli/mode';
import { resolver } from 'src/cli/prompts';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

type Entity = {
	name: string;
	schema?: string;
	table?: string;
	grantor?: string;
	grantee?: string;
	type?: string;
};

const table = (name: string, schema?: string): Entity => ({ name, schema });
const column = (tableName: string, name: string, schema?: string): Entity => ({
	name,
	table: tableName,
	schema,
});

class ExitCalled extends Error {
	constructor(readonly code: string | number | null | undefined) {
		super(`process.exit:${String(code)}`);
	}
}

const captureMissingHintsEmission = (hints: HintsHandler) => {
	const chunks: string[] = [];
	const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
		chunks.push(String(chunk));
		return true;
	});
	const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
		throw new ExitCalled(code);
	});

	let exitCode: string | number | null | undefined;
	try {
		hints.emitAndExit();
	} catch (error) {
		if (!(error instanceof ExitCalled)) {
			throw error;
		}

		exitCode = error.code;
	} finally {
		writeSpy.mockRestore();
		exitSpy.mockRestore();
	}

	return {
		output: chunks.join(''),
		exitCode,
	};
};

beforeEach(() => {
	setJsonMode(true);
});

afterEach(() => {
	vi.restoreAllMocks();
	setJsonMode(false);
});

test('HintsHandler.emitAndExit does not emit when missingHints is empty guard check', () => {
	const hints = new HintsHandler();
	expect(hints.hasUnresolved()).toBe(false);
});

test('resolver aggregates unresolved items across repeated calls on the same HintsHandler', async () => {
	const hints = new HintsHandler();
	const resolveTables = resolver<Entity>('table', 'public', 'push', hints);
	const resolveColumns = resolver<Entity>('column', 'public', 'push', hints);

	const tableResult = await resolveTables({
		created: [table('members', 'public')],
		deleted: [table('users', 'public')],
	});
	const columnResult = await resolveColumns({
		created: [column('users', 'email', 'public')],
		deleted: [column('users', 'name', 'public')],
	});

	expect(tableResult.unresolved).toStrictEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
	]);
	expect(columnResult.unresolved).toStrictEqual([
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
	]);
	expect(hints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] },
			{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'email'] },
		],
	});
});

test('each HintsHandler instance owns its own missing hints state', async () => {
	const firstHints = new HintsHandler();
	const secondHints = new HintsHandler();

	const resolveFirst = resolver<Entity>('table', 'public', 'push', firstHints);
	const resolveSecond = resolver<Entity>('table', 'public', 'push', secondHints);

	await resolveFirst({
		created: [table('members', 'public')],
		deleted: [table('users', 'public')],
	});
	await resolveSecond({
		created: [table('accounts', 'public')],
		deleted: [table('profiles', 'public')],
	});

	expect(firstHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'members'] }],
	});
	expect(secondHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'accounts'] }],
	});
});

test('emitAndExit writes the missing_hints payload to stdout and exits with code 2', () => {
	const hints = new HintsHandler();
	hints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] });
	hints.pushMissingHint({
		type: 'confirm_data_loss',
		kind: 'table',
		entity: ['public', 'customers'],
		reason: 'non_empty',
	});

	const { output, exitCode } = captureMissingHintsEmission(hints);

	expect(exitCode).toBe(2);
	expect(output).toBe(
		JSON.stringify({
			status: 'missing_hints',
			unresolved: [
				{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] },
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'customers'], reason: 'non_empty' },
			],
		}) + '\n',
	);
	expect(JSON.parse(output)).toStrictEqual({
		status: 'missing_hints',
		unresolved: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] },
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'customers'], reason: 'non_empty' },
		],
	});
});

test('emitAndExit is idempotent for the same HintsHandler state', () => {
	const hints = new HintsHandler();
	hints.pushMissingHint({ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'legacy_flag'] });

	const first = captureMissingHintsEmission(hints);
	const second = captureMissingHintsEmission(hints);

	expect(second).toStrictEqual(first);
});

test('new HintsHandler() produces a fresh missing hint list each time', () => {
	const firstHints = new HintsHandler();
	firstHints.pushMissingHint({ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] });

	const secondHints = new HintsHandler();

	expect(secondHints.hasUnresolved()).toBe(false);
	expect(firstHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'orders'] }],
	});
	expect(secondHints.toResponse()).toStrictEqual({
		status: 'missing_hints',
		unresolved: [],
	});
});
