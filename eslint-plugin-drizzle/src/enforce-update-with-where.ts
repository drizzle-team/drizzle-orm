import type { TSESLint } from '@typescript-eslint/utils';

type MessageIds = 'enforceUpdateWithWhere';

let lastNodeName: string = '';

const deleteRule: TSESLint.RuleModule<MessageIds> = {
	defaultOptions: [],
	meta: {
		type: 'problem',
		docs: {
			description: 'Enforce that `update` method is used with `where` to avoid deleting all the rows in a table.',
			url: 'https://github.com/drizzle-team/eslint-plugin-drizzle',
		},
		fixable: 'code',
		messages: {
			enforceUpdateWithWhere:
				'Avoid updating all the rows in a table. Use `db.update(...).set(...).where(...)` instead.',
		},
		schema: [],
	},
	create(context) {
		return {
			MemberExpression: (node) => {
				if (node.property.type === 'Identifier') {
					if (
						lastNodeName !== 'where'
						&& node.property.name === 'set'
						&& node.object.type === 'CallExpression'
						&& node.object.callee.type === 'MemberExpression'
						&& node.object.callee.property.type === 'Identifier'
						&& node.object.callee.property.name === 'update'
					) {
						context.report({
							node,
							messageId: 'enforceUpdateWithWhere',
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
