module.exports = {
	root: true,
	extends: ['plugin:@typescript-eslint/base'],
	parser: '@typescript-eslint/parser',
	plugins: ['import', 'unused-imports'],
	rules: {
		'@typescript-eslint/consistent-type-imports': [
			'error',
			{
				disallowTypeAnnotations: false,
			},
		],
		'import/no-cycle': 'error',
		'import/no-self-import': 'error',
		'import/no-empty-named-blocks': 'error',
		'unused-imports/no-unused-imports': 'error',
		'import/no-useless-path-segments': 'error',
		'import/newline-after-import': 'error',
		'import/no-duplicates': 'error',
	},
};
