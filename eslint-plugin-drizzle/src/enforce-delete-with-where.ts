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
			enforceDeleteWithWhere:
				"Without `.where(...)` you will delete all the rows in a table. If you didn't want to do it, please use `db.delete(...).where(...)` instead. Otherwise you can ignore this rule here",
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
					if (node.property.name === 'delete' && lastNodeName !== 'where' && isDrizzleObj(node, options)) {
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
