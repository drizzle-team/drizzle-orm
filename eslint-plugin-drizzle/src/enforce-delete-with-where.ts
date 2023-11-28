import { ESLintUtils } from '@typescript-eslint/utils';
import { isDrizzleObj, type Options } from './utils/options';

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/drizzle-team/eslint-plugin-drizzle');

type MessageIds = 'enforceDeleteWithWhere';

let lastNodeName: string = '';

const deleteRule = createRule<Options, MessageIds>({
	defaultOptions: [{ drizzleObjectName: [] }],
	name: 'enforce-delete-with-where',
	meta: {
		type: 'problem',
		docs: {
			description: 'Enforce that `delete` method is used with `where` to avoid deleting all the rows in a table.',
		},
		fixable: 'code',
		messages: {
			enforceDeleteWithWhere: 'Avoid deleting all the rows in a table. Use `db.delete(...).where(...)` instead.',
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
					if (isDrizzleObj(node, options) && node.property.name === 'delete' && lastNodeName !== 'where') {
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
});

export default deleteRule;
