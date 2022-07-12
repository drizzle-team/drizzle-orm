module.exports = {
	useTabs: true,
	tabWidth: 4,
	singleQuote: true,
	arrowParens: 'always',
	trailingComma: 'all',
	semi: true,
	printWidth: 100,
	bracketSpacing: true,
	importOrder: [
		'^source-map-support',
		'<THIRD_PARTY_MODULES>',
		'^~\\/',
		'^(\\.\\.?|@\\/)(.*\\/[^.\\/]+|\\/?)$',
		'\\.[^.\\/]+$',
	],
	// require.resolve is required (pun unintended) because of pnpm - may be fixed in the future by Prettier team
	plugins: [require.resolve('@trivago/prettier-plugin-sort-imports')],
	importOrderSeparation: true,
	overrides: [
		{
			files: ['**/*.yml', '**/*.yaml'],
			options: {
				useTabs: false,
				tabWidth: 2,
			},
		},
		{
			files: ['**/*.md'],
			options: {
				useTabs: true,
				tabWidth: 2,
			},
		},
	],
};
