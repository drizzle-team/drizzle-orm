import type { TSESTree } from '@typescript-eslint/utils';

/**
 * Walks up the AST from a MemberExpression that is the callee of a chained
 * method call (e.g. `.set` in `db.update().set().from(x).where(y)`) and
 * returns `true` if any subsequent chained call uses the given method name.
 *
 * This is needed because ESLint visits MemberExpression nodes from the
 * outermost call inward, so tracking the previously-visited property name
 * fails for chains where the relevant method (e.g. `.where`) does not appear
 * immediately after the node we are inspecting.
 */
export const isMethodCalledLaterInChain = (
	node: TSESTree.MemberExpression,
	methodName: string,
): boolean => {
	let current: TSESTree.Node | undefined = node;
	while (current && current.parent) {
		const parent: TSESTree.Node = current.parent;
		// We expect to be the callee of a CallExpression, e.g. `.set` in `.set()`
		if (parent.type === 'CallExpression' && parent.callee === current) {
			const grandparent: TSESTree.Node | undefined = parent.parent;
			if (
				grandparent
				&& grandparent.type === 'MemberExpression'
				&& grandparent.object === parent
				&& grandparent.property.type === 'Identifier'
			) {
				if (grandparent.property.name === methodName) {
					return true;
				}
				current = grandparent;
				continue;
			}
		}
		return false;
	}
	return false;
};

export const resolveMemberExpressionPath = (node: TSESTree.MemberExpression) => {
	let objectExpression = node.object;
	let fullName = '';

	const addToFullName = (name: string) => {
		const prefix = fullName ? '.' : '';
		fullName = `${name}${prefix}${fullName}`;
	};

	while (objectExpression) {
		if (objectExpression.type === 'MemberExpression') {
			if (objectExpression.property.type === 'Identifier') {
				addToFullName(objectExpression.property.name);
			}
			objectExpression = objectExpression.object;
		} else if (objectExpression.type === 'CallExpression' && objectExpression.callee.type === 'Identifier') {
			addToFullName(`${objectExpression.callee.name}(...)`);
			break;
		} else if (objectExpression.type === 'CallExpression' && objectExpression.callee.type === 'MemberExpression') {
			if (objectExpression.callee.property.type === 'Identifier') {
				addToFullName(`${objectExpression.callee.property.name}(...)`);
			}
			objectExpression = objectExpression.callee.object;
		} else if (objectExpression.type === 'Identifier') {
			addToFullName(objectExpression.name);
			break;
		} else if (objectExpression.type === 'ThisExpression') {
			addToFullName('this');
			break;
		} else {
			break;
		}
	}

	return fullName;
};
