import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { resolveMemberExpressionPath } from './utils/ast';
import { isDrizzleObj, type Options } from './utils/options';

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/drizzle-team/eslint-plugin-drizzle');
type MessageIds = 'enforceUpdateWithWhere';

/**
 * Walk upward from a MemberExpression through the chained call pattern
 * (CallExpression → MemberExpression → CallExpression → …) and return
 * true if any property in the chain is named `where`.
 */
function chainContainsWhere(node: TSESTree.MemberExpression): boolean {
	let current: TSESTree.Node = node;

	// Walk up through the chain: MemberExpression → CallExpression → MemberExpression → …
	while (current.parent) {
		const parent = current.parent;

		// A CallExpression wrapping the current node (e.g. `.set(...)`)
		if (parent.type === 'CallExpression' && parent.callee === current) {
			current = parent;
			continue;
		}

		// A MemberExpression whose object is the current CallExpression (e.g. `.from(...)` after `.set(...)`)
		if (parent.type === 'MemberExpression' && parent.object === current) {
			if (parent.property.type === 'Identifier' && parent.property.name === 'where') {
				return true;
			}
			current = parent;
			continue;
		}

		// AwaitExpression wraps the whole chain — keep going
		if (parent.type === 'AwaitExpression') {
			current = parent;
			continue;
		}

		break;
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
						&& !chainContainsWhere(node)
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
