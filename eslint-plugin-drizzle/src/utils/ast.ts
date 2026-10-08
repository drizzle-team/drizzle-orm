import type { TSESTree } from '@typescript-eslint/utils';

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

/**
 * Checks whether a `MemberExpression` like `db.delete` (or `db.update(...).set`) is
 * followed by a `.where` access anywhere further up its call chain, e.g.
 * `db.delete(users).where(...)` or `db.update(t).set({...}).from(...).where(...)`.
 */
export const isFollowedByWhere = (node: TSESTree.MemberExpression): boolean => {
	let current: TSESTree.Node | undefined = node.parent;
	while (current) {
		if (current.type === 'CallExpression') {
			current = current.parent;
			continue;
		}
		if (current.type === 'MemberExpression') {
			if (current.property.type === 'Identifier' && current.property.name === 'where') {
				return true;
			}
			current = current.parent;
			continue;
		}
		return false;
	}
	return false;
};
