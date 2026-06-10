import { readFileSync } from 'node:fs';

// Positive integer starting from 1 — leading zeros rejected to keep the wire format unambiguous.
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const parseSkillsRevision = (markdown: string): string => {
	const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!block) throw new Error('umbrella SKILL.md missing YAML frontmatter');
	const meta = block[1]!.match(/^metadata:\s*\r?\n((?:[ \t]+\S.*\r?\n?)+)/m);
	if (!meta) throw new Error('umbrella SKILL.md frontmatter missing `metadata:` block');
	const field = meta[1]!.match(/^[ \t]+revision:\s*["']?([^"'\r\n]+)["']?\s*$/m);
	if (!field) throw new Error('umbrella SKILL.md `metadata.revision` not found');
	const value = field[1]!.trim();
	if (!POSITIVE_INTEGER.test(value)) throw new Error(`metadata.revision must be a positive integer, got '${value}'`);
	return value;
};

export const readSkillsRevisionFromDisk = (skillsDir: string): string => {
	return parseSkillsRevision(readFileSync(`${skillsDir}/drizzle/SKILL.md`, 'utf8'));
};
