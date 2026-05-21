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
});
