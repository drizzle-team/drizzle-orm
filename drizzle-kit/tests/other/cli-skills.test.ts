// Verifies the removal of the superseded skills in the `skills` command.
// `supersededSkillsRemoveArgs` must name the seven old skills and pass `-y`, so that the removal asks no question.
// `isNoOpRemoveOutput` must return true only for the output of a removal that found no skill, because the
// command hides only that output.
import { expect, test } from 'vitest';
import { isNoOpRemoveOutput, supersededSkillsRemoveArgs } from '../../src/cli/schema';

test('the removal of the superseded skills names the seven old skills and asks no question', () => {
	expect(supersededSkillsRemoveArgs).toStrictEqual([
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
	expect(isNoOpRemoveOutput('■  No matching skills found for: drizzle-generate, drizzle-push')).toBe(true);
	expect(isNoOpRemoveOutput('◆  Successfully removed 7 skill(s)')).toBe(false);
	expect(isNoOpRemoveOutput('')).toBe(false);
	expect(isNoOpRemoveOutput('Error: EACCES: permission denied')).toBe(false);
});
