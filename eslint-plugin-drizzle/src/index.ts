import type { ClassicConfig, FlatConfig, LooseRuleDefinition, SharedConfig } from '@typescript-eslint/utils/ts-eslint';
import deleteRule from './rules/enforce-delete-with-where';
import updateRule from './rules/enforce-update-with-where';

// @ts-ignore ../package.json is not in rootDir, import would throw TS for a loop
const { name, version } = require('../package.json') as typeof import('../package.json');

const configAll: ClassicConfig.Config = {
	env: {
		es2024: true,
	},
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
	plugins: ['drizzle'],
	rules: {
		'drizzle/enforce-delete-with-where': 'error',
		'drizzle/enforce-update-with-where': 'error',
	},
};

const plugin: {
	meta: SharedConfig.PluginMeta;
	rules: Record<string, LooseRuleDefinition>;
	configs: Record<'all' | 'recommended', ClassicConfig.Config> & {
		flat?: Record<'all' | 'recommended', FlatConfig.Config>; // add ConfigArray if rule config complicates later
	};
} = {
	meta: { name, version },
	rules: {
		'enforce-delete-with-where': deleteRule,
		'enforce-update-with-where': updateRule,
	},
	configs: {
		all: configAll,
		recommended: configAll,
	},
};

const flatConfigs: Record<'all' | 'recommended', FlatConfig.Config> = {
	all: {
		plugins: { drizzle: plugin },
		rules: {
			'drizzle/enforce-delete-with-where': 'error',
			'drizzle/enforce-update-with-where': 'error',
		},
		languageOptions: {
			ecmaVersion: 2024,
			parserOptions: plugin.configs.all.parserOptions,
		},
	},
	recommended: {
		plugins: { drizzle: plugin },
		rules: {
			'drizzle/enforce-delete-with-where': 'error',
			'drizzle/enforce-update-with-where': 'error',
		},
		languageOptions: {
			ecmaVersion: 2024,
			parserOptions: plugin.configs.recommended.parserOptions,
		},
	},
};

plugin.configs.flat = flatConfigs;

export = plugin;
