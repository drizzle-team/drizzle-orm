import { stripAnsi } from 'hanji/utils';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const skillsDir = resolve(__dirname, '..', '..', 'skills');

const listSkillSlugs = (): string[] =>
	readdirSync(skillsDir).filter((entry) => {
		const entryPath = join(skillsDir, entry);
		return statSync(entryPath).isDirectory() && existsSync(join(entryPath, 'SKILL.md'));
	});

describe('skill catalog', () => {
	test('contains at least one SKILL.md', () => {
		const slugs = listSkillSlugs();
		expect(
			slugs.length,
			`expected at least one <slug>/SKILL.md under ${skillsDir}, found ${slugs.length}`,
		).toBeGreaterThanOrEqual(1);
	});

	test('every SKILL.md has required frontmatter and matches folder name', () => {
		const slugs = listSkillSlugs();
		const seenNames = new Set<string>();

		for (const slug of slugs) {
			const body = readFileSync(join(skillsDir, slug, 'SKILL.md'), 'utf8');
			const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
			expect(match, `${slug}/SKILL.md is missing YAML frontmatter`).not.toBeNull();

			const fm = match![1]!;
			const nameMatch = fm.match(/^name:\s*(\S+)\s*$/m);
			const descMatch = fm.match(/^description:\s*(.+\S)\s*$/m);

			expect(nameMatch, `${slug}/SKILL.md frontmatter is missing 'name'`).not.toBeNull();
			expect(descMatch, `${slug}/SKILL.md frontmatter is missing 'description'`).not.toBeNull();
			expect(nameMatch![1], `${slug}/SKILL.md frontmatter 'name' must match folder name`).toBe(slug);
			expect(seenNames.has(nameMatch![1]!), `duplicate skill name across catalog: ${nameMatch![1]}`).toBe(false);
			seenNames.add(nameMatch![1]!);
		}
	});

	// The regex-based frontmatter check above passes even when YAML semantics make a SKILL.md unparseable —
	// e.g. an unquoted `description:` value containing a colon-space (`status: 'missing_hints'`) is a valid line
	// match but a nested-mapping error to a real YAML parser, and the upstream `skills` package silently drops
	// such skills via `parseSkillMd`'s try/catch. Run the real `skills` CLI to catch that class of regression.
	test('npx skills add --list discovers every catalog entry', () => {
		const slugs = listSkillSlugs();

		const result = spawnSync('npx', ['-y', 'skills@latest', 'add', skillsDir, '--list'], {
			encoding: 'utf8',
			timeout: 120_000,
		});

		expect(result.error, `failed to spawn npx skills: ${result.error?.message}`).toBeUndefined();
		expect(result.status, `npx skills exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
			.toBe(0);

		const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
		const foundMatch = output.match(/Found (\d+) skills?/);

		expect(foundMatch, `'Found N skills' line missing from skills CLI output:\n${output}`).not.toBeNull();
		expect(
			Number(foundMatch![1]),
			`skills CLI discovered ${foundMatch![1]} skills but ${slugs.length} <slug>/SKILL.md exist on disk — `
				+ `usually a malformed SKILL.md frontmatter (e.g. unquoted colon-space in description). Output:\n${output}`,
		).toBe(slugs.length);

		for (const slug of slugs) {
			expect(output, `skills CLI did not list '${slug}' — likely a SKILL.md parse failure. Output:\n${output}`)
				.toContain(slug);
		}
	}, 180_000);
});
