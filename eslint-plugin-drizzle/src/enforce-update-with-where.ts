import type { TSESTree } from '@typescript-eslint/utils';
import { ESLintUtils } from '@typescript-eslint/utils';
import { resolveMemberExpressionPath } from './utils/ast';
import { isDrizzleObj, type Options } from './utils/options';

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/drizzle-team/eslint-plugin-drizzle');
type MessageIds = 'enforceUpdateWithWhere';

function chainHasMethod(node: TSESTree.MemberExpression, name: string): boolean {
	let current: TSESTree.Node | undefined = node.parent;
	while (current) {
		if (
			current.type === 'MemberExpression'
			&& current.property.type === 'Identifier'
			&& current.property.name === name
		) {
			return true;
		}
		if (current.type === 'CallExpression') {
			current = current.parent;
		} else if (current.type === 'MemberExpression') {
			current = current.parent;
		} else {
			break;
		}
	}
	return false;
}

const updateRule = createRule<Options, MessageIds>({
	defaultOptions: [{ drizzleObjectName: [] }],
	name: 'enforce-update-with-where',
	meta: {
		type: 'problem',
		docs: {
			description: 'Enforce that `update` method is used with `where` to avoid deleting all the rows in a table.',
		},
		fixable: 'code',
		messages: {
			enforceUpdateWithWhere:
				"Without `.where(...)` you will update all the rows in a table. If you didn't want to do it, please use `{{ drizzleObjName }}.update(...).set(...).where(...)` instead. Otherwise you can ignore this rule here",
		},
		schema: [{
			type: 'object',
			properties: {
				drizzleObjectName: {
					type: ['string', 'array'],
				},
			},
			additionalProperties: false,
		}],
	},
	create(context, options) {
		return {
			MemberExpression: (node) => {
				if (node.property.type === 'Identifier') {
					if (
						node.property.name === 'set'
						&& node.object.type === 'CallExpression'
						&& node.object.callee.type === 'MemberExpression'
						&& node.object.callee.property.type === 'Identifier'
						&& node.object.callee.property.name === 'update'
						&& isDrizzleObj(node.object.callee, options)
						&& !chainHasMethod(node, 'where')
					) {
						context.report({
							node,
							messageId: 'enforceUpdateWithWhere',
							data: {
								drizzleObjName: resolveMemberExpressionPath(node.object.callee),
							},
						});
					}
				}
				return;
			},
		};
	},
});

export default updateRule;
