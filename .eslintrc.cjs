module.exports = {
	root: true,
	extends: ['plugin:@typescript-eslint/base'],
	parser: '@typescript-eslint/parser',
	plugins: ['import'],
	rules: {
		'@typescript-eslint/consistent-type-imports': [
			'error',
			{
				disallowTypeAnnotations: false,
			},
		],
		'import/no-cycle': 'error',
		'import/no-self-import': 'error',
	},
};
