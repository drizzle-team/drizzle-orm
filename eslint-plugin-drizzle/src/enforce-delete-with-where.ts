import type { TSESLint } from '@typescript-eslint/utils';

type MessageIds = 'enforceDeleteWithWhere';

let lastNodeName: string = '';

const deleteRule: TSESLint.RuleModule<MessageIds> = {
	defaultOptions: [],
	meta: {
		type: 'problem',
		docs: {
			description: 'Enforce that `delete` method is used with `where` to avoid deleting all the rows in a table.',
			url: 'https://github.com/drizzle-team/eslint-plugin-drizzle',
		},
		fixable: 'code',
		messages: {
			enforceDeleteWithWhere: 'Avoid deleting all the rows in a table. Use `db.delete(...).where(...)` instead.',
		},
		schema: [],
	},
	create(context) {
		return {
			MemberExpression: (node) => {
				if (node.property.type === 'Identifier') {
					if (node.property.name === 'delete' && lastNodeName !== 'where') {
						context.report({
							node,
							messageId: 'enforceDeleteWithWhere',
						});
					}
					lastNodeName = node.property.name;
				}
				return;
			},
		};
	},
};

export default deleteRule;
