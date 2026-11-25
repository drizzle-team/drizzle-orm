import { join } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, test } from 'vitest';

// Fixtures `type-tests/<dialect>/displayed-types.ts` are compiled here to check result types display as
// plain types (as IDE hovers and error messages show them) instead of applications of internal type aliases.

const dialects = ['pg', 'mysql', 'sqlite', 'mssql', 'cockroach', 'singlestore'] as const;
const root = join(import.meta.dirname, '..');
const fixtureOf = (dialect: string) => join(root, 'type-tests', dialect, 'displayed-types.ts');

// Matches applications of generic types, e.g. `SubqueryResultField<...>`
const typeApplication = /\b[A-Z]\w*</;

let displayed: Record<string, Record<string, string>>;

beforeAll(() => {
	const config = ts.getParsedCommandLineOfConfigFile(join(root, 'type-tests', 'tsconfig.json'), {}, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
			throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
		},
	})!;
	const program = ts.createProgram({ rootNames: dialects.map(fixtureOf), options: config.options });
	const checker = program.getTypeChecker();

	displayed = {};
	for (const dialect of dialects) {
		const sourceFile = program.getSourceFile(fixtureOf(dialect))!;
		const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
		if (diagnostics.length) {
			throw new Error(
				`${dialect} fixture doesn't compile:\n${
					diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')
				}`,
			);
		}

		const types: Record<string, string> = {};
		for (const statement of sourceFile.statements) {
			if (
				!ts.isVariableStatement(statement)
				|| !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
			) continue;

			for (const declaration of statement.declarationList.declarations) {
				types[declaration.name.getText(sourceFile)] = checker.typeToString(
					checker.getTypeAtLocation(declaration.name),
					declaration,
					// Flags of IDE hovers
					ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
				);
			}
		}
		displayed[dialect] = types;
	}
}, 300_000);

// Same tables and selections in every dialect's fixture produce same results
const expected: Record<string, string> = {
	singleTable: '{ id: number; name: string; bio: string | null; }[]',
	leftJoined:
		'{ dt_users: { id: number; name: string; bio: string | null; }; dt_posts: { id: number; authorId: number | null; title: string; } | null; }[]',
	rightJoined:
		'{ dt_users: { id: number; name: string; bio: string | null; } | null; dt_posts: { id: number; authorId: number | null; title: string; }; }[]',
	innerJoined:
		'{ dt_users: { id: number; name: string; bio: string | null; }; dt_posts: { id: number; authorId: number | null; title: string; }; }[]',
	aliasedTable: '{ id: number; name: string; bio: string | null; }[]',
	partialColumns: '{ id: number; bio: string | null; }[]',
	partialJoinedColumns: '{ name: string; title: string | null; }[]',
	partialTables:
		'{ user: { id: number; name: string; bio: string | null; }; post: { id: number; authorId: number | null; title: string; } | null; }[]',
	partialGroups:
		'{ sameTable: { id: number; name: string; } | null; mixedTables: { name: string | null; title: string; }; sqlOnly: { one: number; two: number; }; }[]',
	partialSql: '{ typed: number; untyped: unknown; aliased: string; mapped: number; aggregate: number; }[]',
	partialScalarSubquery: '{ id: number; author: string | null; }[]',
	jsonObjects:
		'{ object: { id: number; bio: string | null; upper: string; mapped: number; scalar: string | null; nested: { name: string; }; }; aliased: { name: string; }; table: { id: number; name: string; bio: string | null; }; }[]',
	joinedJsonObjects: '{ post: { title: string; }; author: { id: number | null; bio: string | null; }; }[]',
	jsonArrays:
		'{ ids: number[]; bios: (string | null)[]; objects: { id: number; bio: string | null; }[]; aliased: string[]; inObject: { names: string[]; }; scalar: string[] | null; }[]',
	joinedJsonArrays: '{ id: number; titles: (string | null)[]; }[]',
	joinedJsonArray: '{ titles: string[] | null; wrapped: { titles: string[] | null; }; }[]',
	aggregatedJoinedJsonArray: '{ all: (string[] | null)[]; }[]',
	fromSubquery:
		'{ id: number; bio: string | null; upper: string; post: { title: string | null; }; user: { id: number; name: string; bio: string | null; }; scalar: string | null; object: { name: string; title: string | null; }; }[]',
	joinedSubquery:
		'{ dt_posts: { id: number; authorId: number | null; title: string; }; sq: { id: number; bio: string | null; upper: string; post: { title: string | null; }; user: { id: number; name: string; bio: string | null; }; scalar: string | null; object: { name: string; title: string | null; }; } | null; }[]',
	partialFromSubquery:
		'{ id: number; upper: string; scalar: string | null; object: { name: string; title: string | null; }; wrapped: { object: { name: string; title: string | null; }; scalar: string | null; }; }[]',
	jsonObjectOfSubquery: '{ object: { id: number; bio: string | null; upper: string; }; }[]',
	nestedJoinedJsonObject: '{ post: { title: string; author: { id: number; name: string; } | null; }; }[]',
	reselectedJoinedJsonObject: '{ id: number; author: { id: number; name: string; } | null; }[]',
	fromView: '{ id: number; bio: string | null; upper: string; }[]',
	joinedView:
		'{ dt_posts: { id: number; authorId: number | null; title: string; }; dt_view: { id: number; bio: string | null; upper: string; } | null; }[]',
	jsonObjectOfView: '{ object: { id: number; bio: string | null; upper: string; }; }[]',
	fromCte: '{ id: number; upper: string; }[]',
	union: '{ id: number; name: string; }[]',
};

const unsupported: Partial<Record<(typeof dialects)[number], string[]>> = {
	singlestore: ['fromView', 'joinedView', 'jsonObjectOfView'],
};

describe.each(dialects)('%s', (dialect) => {
	test('result types are displayed as plain types', () => {
		const types = displayed[dialect]!;
		expect(Object.entries(types).filter(([, type]) => typeApplication.test(type))).toStrictEqual([]);

		const skipped = unsupported[dialect] ?? [];
		expect(types).toStrictEqual(
			Object.fromEntries(Object.entries(expected).filter(([name]) => !skipped.includes(name))),
		);
	});
});
