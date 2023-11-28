import type { TSESTree } from '@typescript-eslint/utils';

export type Options = readonly [{
	drizzleObjectName: string[] | string;
}];

export const isDrizzleObj = (
	node: TSESTree.MemberExpression,
	options: Options,
) => {
	const drizzleObjectName = options[0].drizzleObjectName;

	if (
		node.object.type === 'Identifier' && typeof drizzleObjectName === 'string'
		&& node.object.name === drizzleObjectName
	) {
		return true;
	}

	if (Array.isArray(drizzleObjectName)) {
		if (drizzleObjectName.length === 0) {
			return true;
		}

		if (node.object.type === 'Identifier' && drizzleObjectName.includes(node.object.name)) {
			return true;
		}
	}

	return false;
};
