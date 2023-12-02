import type { TSESLint } from '@typescript-eslint/utils';
import { name, version } from '../package.json';
import all from './configs/all';
import recommended from './configs/recommended';
import deleteRule from './enforce-delete-with-where';
import updateRule from './enforce-update-with-where';
import type { Options } from './utils/options';

export const rules = {
	'enforce-delete-with-where': deleteRule,
	'enforce-update-with-where': updateRule,
} satisfies Record<string, TSESLint.RuleModule<string, Options>>;

export const configs = { all, recommended };

export const meta = { name, version };
