import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const root = join(__dirname, '..', '..');

const TOPIC_FILES = [
	'generate.md',
	'push.md',
	'pull.md',
	'migrations.md',
	'hints.md',
	'output-modes.md',
	'responses-and-errors.md',
];

const LEGACY_SKILL_NAMES = [
	'drizzle-generate',
	'drizzle-push',
	'drizzle-pull',
	'drizzle-migrations',
	'drizzle-hints',
	'drizzle-output-modes',
	'drizzle-responses-and-errors',
];

const parseFrontmatterField = (markdown: string, field: string): string => {
	const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!block) return '';
	const line = block[1]!.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
	if (!line) return '';
	let value = line[1]!.trim();
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		value = value.slice(1, -1);
	}
	return value;
};

test('the skills source tree ships exactly one installable skill', () => {
	const entries = readdirSync(join(root, 'skills'), { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name);
	expect(entries).toEqual(['drizzle']);
});

test('the umbrella directory carries the seven topic files and no strays', () => {
	const entries = readdirSync(join(root, 'skills', 'drizzle')).sort();
	const expected = ['SKILL.md', ...TOPIC_FILES].sort();
	expect(entries).toEqual(expected);
});

test('no topic file carries YAML frontmatter', () => {
	for (const file of TOPIC_FILES) {
		const content = readFileSync(join(root, 'skills', 'drizzle', file), 'utf8');
		expect(content.startsWith('---')).toBe(false);
	}
});

test('the umbrella description fits the discovery budget', () => {
	const md = readFileSync(join(root, 'skills', 'drizzle', 'SKILL.md'), 'utf8');
	const description = parseFrontmatterField(md, 'description');
	const whenToUse = parseFrontmatterField(md, 'when_to_use');
	expect(description.length).toBeGreaterThan(0);
	expect(description.length + whenToUse.length).toBeLessThanOrEqual(1536);
	expect(description).toContain('drizzle-orm');
	expect(description).toContain('drizzle.config.ts');
});

test('every routing link resolves and every topic file is routed', () => {
	const md = readFileSync(join(root, 'skills', 'drizzle', 'SKILL.md'), 'utf8');
	const linkTargets = [...md.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1]!);
	for (const target of linkTargets) {
		expect(target).not.toContain('/');
		expect(target).not.toContain('..');
		expect(existsSync(join(root, 'skills', 'drizzle', target))).toBe(true);
	}
	const targetSet = new Set(linkTargets);
	for (const topic of TOPIC_FILES) {
		expect(targetSet.has(topic)).toBe(true);
	}
});

test('no bundle file still points at a superseded skill name', () => {
	for (const file of ['SKILL.md', ...TOPIC_FILES]) {
		const content = readFileSync(join(root, 'skills', 'drizzle', file), 'utf8');
		for (const legacy of LEGACY_SKILL_NAMES) {
			expect(content).not.toContain(legacy);
		}
	}
});

const CONCEPT_TOKENS = [
	// generate
	'--config',
	'--dialect',
	'--schema',
	'--out',
	'--explain',
	'--hints-file',
	'no_changes',
	'missing_hints',
	'migration_path',
	'config_file_not_found_error',
	'config_validation_error',
	'schema_files_not_found_error',
	'orm_version_error',
	'invalid_hints',
	'unsupported_schema_change',
	'internal_error',

	// push
	'--url',
	'--host',
	'--port',
	'--user',
	'--password',
	'--database',
	'--ssl',
	'--auth-token',
	'confirm_data_loss',
	'non_empty',
	'table_recreate',
	'type_change',
	'add_not_null',
	'config_connection_error',
	'database_driver_error',
	'query_error',
	'required_packages_error',
	'primary_key',

	// pull
	'--breakpoints',
	'--casing',
	'--init',
	'schemaPath',
	'relationsPath',
	'snapshotPath',

	// migrations
	'defineConfig',
	'postgresql',
	'singlestore',
	'turso',
	'bigserial',
	'sp_rename',
	'add_unique',
	'drop_pk_dependency',
	'fk_target_not_unique',
	'recreate_table',

	// hints
	'rename_or_create',
	'reason_details',
	'Privilege',

	// output-modes
	'--output json',
	'check_error',

	// responses-and-errors
	'unsupported_command_dialect_error',
	'migrations_outdated_error',
	'ambiguous_params_error',
	'missing_required_params_error',
	'rename_schema_unsupported',
	'rename_blocked_by_check_constraint',
	'orm_missing',
	'orm_too_old',
	'kit_outdated',
	'non_latest',
	'malformed',
	'upgraded',
	'--ignore-conflicts',
];

const PER_FILE_ANCHORS: Record<string, [string, string]> = {
	'generate.md': ['--hints-file', 'unsupported_schema_change'],
	'push.md': ['--auth-token', 'confirm_data_loss'],
	'pull.md': ['--init', 'relationsPath'],
	'migrations.md': ['defineConfig', 'sp_rename'],
	'hints.md': ['rename_or_create', 'Privilege'],
	'output-modes.md': ['--output json', 'check_error'],
	'responses-and-errors.md': ['migrations_outdated_error', '--fix-conflicts'],
};

test('the concept checklist survives the condense', () => {
	const dir = join(root, 'skills', 'drizzle');
	const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
	const combined = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
	for (const token of CONCEPT_TOKENS) {
		expect(combined).toContain(token);
	}
	for (const [file, [first, second]] of Object.entries(PER_FILE_ANCHORS)) {
		const content = readFileSync(join(dir, file), 'utf8');
		expect(content).toContain(first);
		expect(content).toContain(second);
	}
});

test('prune argv targets exactly the seven legacy skills', async () => {
	const schema = await import('../../src/cli/schema') as Record<string, unknown>;
	expect(Array.isArray(schema.LEGACY_SKILLS)).toBe(true);
	const legacySkills = schema.LEGACY_SKILLS as string[];
	expect(legacySkills.length).toBe(7);
	expect([...legacySkills].sort()).toEqual([...LEGACY_SKILL_NAMES].sort());
	expect(legacySkills).not.toContain('drizzle');
});

test('prune argv is non-empty, non-interactive, and never scope-wiping', async () => {
	const schema = await import('../../src/cli/schema') as Record<string, unknown>;
	expect(typeof schema.legacySkillsRemoveArgs).toBe('function');
	const legacySkillsRemoveArgs = schema.legacySkillsRemoveArgs as () => string[];

	const projectArgs = legacySkillsRemoveArgs();
	expect(Array.isArray(projectArgs)).toBe(true);
	expect(projectArgs.length).toBeGreaterThan(0);
	expect(projectArgs[0]).toBe('skills@latest');
	expect(projectArgs[1]).toBe('remove');
	for (const name of LEGACY_SKILL_NAMES) {
		expect(projectArgs).toContain(name);
	}
	expect(projectArgs).toContain('-y');
	expect(projectArgs).not.toContain('--all');
	expect(projectArgs).not.toContain('*');
	expect(projectArgs).not.toContain('drizzle');
});

test('a no-op prune is silenced, anything else is passed through', async () => {
	const schema = await import('../../src/cli/schema') as Record<string, unknown>;
	const isNoOpPruneOutput = schema.isNoOpPruneOutput as (output: string) => boolean;

	expect(isNoOpPruneOutput('■  No matching skills found for: drizzle-generate, drizzle-push')).toBe(true);
	expect(isNoOpPruneOutput('◆  Successfully removed 7 skill(s)')).toBe(false);
	expect(isNoOpPruneOutput('')).toBe(false);
	expect(isNoOpPruneOutput('Error: EACCES: permission denied')).toBe(false);
});

test('prune never reaches user-level skills, matching the project-scoped install', async () => {
	const schema = await import('../../src/cli/schema') as Record<string, unknown>;
	const legacySkillsRemoveArgs = schema.legacySkillsRemoveArgs as () => string[];
	expect(legacySkillsRemoveArgs.length).toBe(0);
	expect(legacySkillsRemoveArgs()).not.toContain('-g');
	expect(legacySkillsRemoveArgs()).not.toContain('--global');

	const source = readFileSync(join(root, 'src', 'cli', 'schema.ts'), 'utf8');
	const handler = source.slice(source.indexOf('export const skills = command('));
	expect(handler).not.toContain("'-g'");
});

test('the umbrella description covers every consolidated trigger', () => {
	const md = readFileSync(join(root, 'skills', 'drizzle', 'SKILL.md'), 'utf8');
	const description = parseFrontmatterField(md, 'description');
	const triggers = [
		'drizzle-orm',
		'drizzle.config.ts',
		'migrations',
		'push',
		'pull',
		'introspect',
		'missing_hints',
		'JSON',
	];
	for (const trigger of triggers) {
		expect(description).toContain(trigger);
	}
});
