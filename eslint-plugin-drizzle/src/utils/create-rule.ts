import { ESLintUtils } from '@typescript-eslint/utils';

export interface TypedLintingRuleDocs {
	description: string;
	recommended?: boolean;
	requiresTypeChecking?: boolean;
}

export const createRule = ESLintUtils.RuleCreator<TypedLintingRuleDocs>(
	(name) => `https://github.com/drizzle-team/drizzle-orm/tree/main/eslint-plugin-drizzle/docs/${name}.md`,
);
