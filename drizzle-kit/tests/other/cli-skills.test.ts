import { expect, test } from 'vitest';
import { isNoOpPruneOutput, legacySkillsRemoveArgs } from '../../src/cli/schema';

test('the removal of the superseded skills names the seven old skills and asks no question', () => {
	expect(legacySkillsRemoveArgs()).toStrictEqual([
		'skills@latest',
		'remove',
		'drizzle-generate',
		'drizzle-push',
		'drizzle-pull',
		'drizzle-migrations',
		'drizzle-hints',
		'drizzle-output-modes',
		'drizzle-responses-and-errors',
		'-y',
	]);
});

test('only the output of a removal that found no skill counts as nothing to print', () => {
	expect(isNoOpPruneOutput('■  No matching skills found for: drizzle-generate, drizzle-push')).toBe(true);
	expect(isNoOpPruneOutput('◆  Successfully removed 7 skill(s)')).toBe(false);
	expect(isNoOpPruneOutput('')).toBe(false);
	expect(isNoOpPruneOutput('Error: EACCES: permission denied')).toBe(false);
});
