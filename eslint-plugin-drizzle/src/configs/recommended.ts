export default {
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
