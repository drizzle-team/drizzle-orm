import { ASTUtils, ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(() => 'https://github.com/drizzle-team/eslint-plugin-drizzle');

type MessageIds = 'enforceAliasInSetOperation' | 'addSetOperationAlias' | 'enforceAliasInSubquery';
type Options = [];

const SET_OPERATIONS = new Set(['union', 'unionAll', 'except', 'exceptAll', 'intersect', 'intersectAll']);
// Methods that take a table-like source whose fields get enumerated on a select-all.
const FROM_METHODS = new Set(['from', 'leftJoin', 'rightJoin', 'innerJoin', 'fullJoin', 'crossJoin']);
// Select builders. `selectDistinctOn(on, selection)` takes the field object as its SECOND argument.
const SELECT_METHODS = new Set(['select', 'selectDistinct', 'selectDistinctOn']);
const selectionArgIndex = (methodName: string): number => (methodName === 'selectDistinctOn' ? 1 : 0);

// -- Raw-sql field helpers ---------------------------------------------------

// Does this expression bottom out in a `sql`...`` tagged template?
const rootsInSqlTemplate = (node: TSESTree.Node | undefined): boolean => {
	let current = node;
	while (current) {
		switch (current.type) {
			case 'TaggedTemplateExpression':
				return current.tag.type === 'Identifier' && current.tag.name === 'sql';
			case 'CallExpression':
				current = current.callee;
				break;
			case 'MemberExpression':
				current = current.object;
				break;
			case 'TSNonNullExpression':
			case 'TSAsExpression':
			case 'TSInstantiationExpression':
				current = current.expression;
				break;
			default:
				return false;
		}
	}
	return false;
};

// Does the chain include an `.as(...)` call?
const hasAsCall = (node: TSESTree.Node | undefined): boolean => {
	let current = node;
	while (current) {
		if (current.type === 'CallExpression') {
			const { callee } = current;
			if (
				callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && callee.property.name === 'as'
			) {
				return true;
			}
			current = callee;
		} else if (current.type === 'MemberExpression') {
			current = current.object;
		} else if (
			current.type === 'TSNonNullExpression'
			|| current.type === 'TSAsExpression'
			|| current.type === 'TSInstantiationExpression'
		) {
			current = current.expression;
		} else {
			return false;
		}
	}
	return false;
};

// Collect raw-sql property values that lack an alias (descending into ternary arms).
const collectUnaliasedSql = (value: TSESTree.Node | undefined, acc: TSESTree.Node[]): TSESTree.Node[] => {
	if (!value) {
		return acc;
	}
	if (value.type === 'ConditionalExpression') {
		collectUnaliasedSql(value.consequent, acc);
		collectUnaliasedSql(value.alternate, acc);
		return acc;
	}
	if (rootsInSqlTemplate(value) && !hasAsCall(value)) {
		acc.push(value);
	}
	return acc;
};

const propertyKeyName = (key: TSESTree.Node): string | null => {
	if (key.type === 'Identifier') {
		return key.name;
	}
	if (key.type === 'Literal' && typeof key.value === 'string') {
		return key.value;
	}
	return null;
};

// Map each field of a `.select({...})` object to its unaliased raw sql node(s), if any.
const unaliasedRawFields = (fieldObject: TSESTree.ObjectExpression): Map<string, TSESTree.Node[]> => {
	const fields = new Map<string, TSESTree.Node[]>();
	for (const property of fieldObject.properties) {
		if (property.type !== 'Property') {
			continue;
		}
		const name = propertyKeyName(property.key);
		if (name === null) {
			continue;
		}
		const nodes = collectUnaliasedSql(property.value, []);
		if (nodes.length > 0) {
			fields.set(name, nodes);
		}
	}
	return fields;
};

// Walk down a fluent chain (or unwrap an arrow body) to the object passed to `.select({...})`.
// Returns null for a select with no field object (e.g. select-all `db.select()`).
const findSelectFieldObject = (node: TSESTree.Node | undefined): TSESTree.ObjectExpression | null => {
	let current = node;
	while (current) {
		if (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') {
			if (current.body.type === 'BlockStatement') {
				const returned = current.body.body.find((statement) => statement.type === 'ReturnStatement');
				current = returned && returned.type === 'ReturnStatement' ? returned.argument ?? undefined : undefined;
			} else {
				current = current.body;
			}
			continue;
		}
		if (current.type === 'CallExpression') {
			if (
				current.callee.type === 'MemberExpression'
				&& current.callee.property.type === 'Identifier'
				&& SELECT_METHODS.has(current.callee.property.name)
			) {
				const argument = current.arguments[selectionArgIndex(current.callee.property.name)];
				return argument && argument.type === 'ObjectExpression' ? argument : null;
			}
			current = current.callee;
			continue;
		}
		if (current.type === 'MemberExpression') {
			current = current.object;
			continue;
		}
		return null;
	}
	return null;
};

// -- Set-operation detection -------------------------------------------------

// If `node` is a direct argument to a set-operation call, return that operation's name.
const setOperationArgumentName = (node: TSESTree.Node): string | null => {
	const parent = node.parent;
	if (!parent || parent.type !== 'CallExpression' || !parent.arguments.some((arg) => arg === node)) {
		return null;
	}
	const { callee } = parent;
	if (callee.type === 'Identifier' && SET_OPERATIONS.has(callee.name)) {
		return callee.name;
	}
	if (
		callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
		&& SET_OPERATIONS.has(callee.property.name)
	) {
		return callee.property.name;
	}
	return null;
};

// -- Subquery / CTE detection ------------------------------------------------

const unwrapType = (node: TSESTree.Node | undefined): TSESTree.Node | undefined => {
	let current = node;
	while (
		current
		&& (current.type === 'TSAsExpression'
			|| current.type === 'TSNonNullExpression'
			|| current.type === 'TSInstantiationExpression')
	) {
		current = current.expression;
	}
	return current;
};

const isWithCall = (node: TSESTree.Node): boolean =>
	node.type === 'CallExpression'
	&& node.callee.type === 'MemberExpression'
	&& node.callee.property.type === 'Identifier'
	&& node.callee.property.name === '$with';

// If `init` creates a subquery (`<select>.as('x')`) or a CTE (`db.$with('x').as(<select>)`),
// return the object passed to its inner `.select({...})`.
const subqueryFieldSource = (init: TSESTree.Node | undefined): TSESTree.ObjectExpression | null => {
	const node = unwrapType(init);
	if (!node || node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') {
		return null;
	}
	const { callee } = node;
	if (callee.property.type !== 'Identifier' || callee.property.name !== 'as') {
		return null;
	}
	// Subquery: `<select chain>.as('name')`
	const fromSelectChain = findSelectFieldObject(callee.object);
	if (fromSelectChain) {
		return fromSelectChain;
	}
	// CTE: `X.$with(...).as(<select | (qb) => select>)`
	if (isWithCall(callee.object)) {
		return findSelectFieldObject(node.arguments[0]);
	}
	return null;
};

// Is the `.select()` paired with this `.from()`/join in the same chain a select-all (no field object)?
const enclosingSelectIsEmpty = (node: TSESTree.Node): boolean => {
	let current: TSESTree.Node | undefined = node;
	while (current) {
		if (current.type === 'CallExpression') {
			if (
				current.callee.type === 'MemberExpression'
				&& current.callee.property.type === 'Identifier'
				&& SELECT_METHODS.has(current.callee.property.name)
			) {
				// Select-all: no field object was passed (`.select()` / `.selectDistinctOn([...])`).
				return current.arguments.length <= selectionArgIndex(current.callee.property.name);
			}
			current = current.callee;
			continue;
		}
		if (current.type === 'MemberExpression') {
			current = current.object;
			continue;
		}
		return false;
	}
	return false;
};

// Is `id` a subquery source of a select-all query (`db.select().from(id)` / `.leftJoin(id, ...)`)?
const isSelectAllReference = (id: TSESTree.Node): boolean => {
	const parent = id.parent;
	if (!parent || parent.type !== 'CallExpression' || parent.callee.type !== 'MemberExpression') {
		return false;
	}
	const { callee } = parent;
	if (callee.property.type !== 'Identifier' || !FROM_METHODS.has(callee.property.name)) {
		return false;
	}
	if (!parent.arguments.some((argument) => argument === id)) {
		return false;
	}
	return enclosingSelectIsEmpty(callee.object);
};

const rule = createRule<Options, MessageIds>({
	name: 'enforce-alias-in-subquery',
	defaultOptions: [],
	meta: {
		type: 'problem',
		// Only the subquery/CTE case is auto-fixed: there the alias must equal the referenced key,
		// so it is provably correct. The set-operation alias is contextual (it should match the same
		// field in the other branch), so that case is offered as a manual suggestion instead.
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description:
				'Enforce an explicit `.as()` alias on raw `sql` fields that drizzle reads by name from a subquery, CTE, or set operation, which otherwise throws when the query is built.',
		},
		messages: {
			enforceAliasInSetOperation:
				"Raw `sql` field '{{ name }}' in a `{{ operation }}` set operation has no alias. Add `.as(...)` using the same alias as this field in the other branch(es) — drizzle throws for an unaliased raw `sql` field read from a trailing branch.",
			addSetOperationAlias: "Add `.as('{{ name }}')` (check the alias matches this field in the other branch(es)).",
			enforceAliasInSubquery:
				"Raw `sql` field '{{ name }}' is read from a subquery/CTE but has no alias. Add `.as('{{ name }}')` — drizzle throws when a raw `sql` field is referenced from a subquery.",
		},
		schema: [],
	},
	create(context) {
		// ESLint 9 removed `context.getScope()`; `SourceCode#getScope(node)` is the replacement
		// (available since ESLint 8.37), and `context.sourceCode` since 8.40. Fall back through
		// `getSourceCode()` and the old `context.getScope()` so the rule works on ESLint 8.0+.
		const scopeFor = (node: TSESTree.Node) => {
			const sourceCode = context.sourceCode ?? context.getSourceCode();
			return sourceCode.getScope ? sourceCode.getScope(node) : context.getScope();
		};
		// Returns the enclosing set-operation name if this `.select({...})` flows into one.
		// Covers the function form `union(a, b)` (inline or via a variable) and the method form
		// `a.union(b)` on either side.
		const setOperationFor = (selectCall: TSESTree.Node): string | null => {
			let current = selectCall;
			for (;;) {
				const parent = current.parent;
				if (!parent) {
					return null;
				}
				// Walk up the fluent chain (`.from().where()...`).
				if (parent.type === 'MemberExpression' && parent.object === current) {
					// Method form with our select on the receiver side: `<select>.union(...)`.
					const grandParent = parent.parent;
					if (
						parent.property.type === 'Identifier'
						&& SET_OPERATIONS.has(parent.property.name)
						&& grandParent !== undefined
						&& grandParent.type === 'CallExpression'
						&& grandParent.callee === parent
					) {
						return parent.property.name;
					}
					current = parent;
					continue;
				}
				if (parent.type === 'CallExpression' && parent.callee === current) {
					current = parent;
					continue;
				}
				// End of the chain: `union(current, ...)` or `x.union(current)`.
				const direct = setOperationArgumentName(current);
				if (direct) {
					return direct;
				}
				// Assigned to a variable that is later passed to a set operation.
				if (parent.type === 'VariableDeclarator' && parent.init === current && parent.id.type === 'Identifier') {
					const variable = ASTUtils.findVariable(scopeFor(parent.id), parent.id.name);
					if (variable) {
						for (const reference of variable.references) {
							if (reference.identifier !== parent.id) {
								const name = setOperationArgumentName(reference.identifier);
								if (name) {
									return name;
								}
							}
						}
					}
				}
				return null;
			}
		};

		return {
			// Set operations: every unaliased raw `sql` field of a union/except/intersect branch throws.
			CallExpression(node) {
				const { callee } = node;
				if (
					callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier'
					|| !SELECT_METHODS.has(callee.property.name)
				) {
					return;
				}
				const fieldObject = node.arguments[selectionArgIndex(callee.property.name)];
				if (!fieldObject || fieldObject.type !== 'ObjectExpression') {
					return;
				}
				const operation = setOperationFor(node);
				if (!operation) {
					return;
				}
				for (const property of fieldObject.properties) {
					if (property.type !== 'Property') {
						continue;
					}
					const name = propertyKeyName(property.key);
					for (const sqlNode of collectUnaliasedSql(property.value, [])) {
						const data = { name: name ?? 'field', operation };
						if (name) {
							context.report({
								node: sqlNode,
								messageId: 'enforceAliasInSetOperation',
								data,
								// A manual suggestion, not an auto-fix: the correct alias is the one used for
								// this field in the other branch(es), which the rule cannot know — the key is
								// only a starting point the developer should confirm.
								suggest: [{
									messageId: 'addSetOperationAlias',
									data: { name },
									fix: (fixer) => fixer.insertTextAfter(sqlNode, `.as('${name}')`),
								}],
							});
						} else {
							context.report({ node: sqlNode, messageId: 'enforceAliasInSetOperation', data });
						}
					}
				}
			},

			// Subqueries / CTEs: an unaliased raw `sql` field throws only when it is read
			// (via `sub.field` or a select-all `db.select().from(sub)`).
			VariableDeclarator(node) {
				if (node.id.type !== 'Identifier') {
					return;
				}
				const fieldObject = subqueryFieldSource(node.init ?? undefined);
				if (!fieldObject) {
					return;
				}
				const rawFields = unaliasedRawFields(fieldObject);
				if (rawFields.size === 0) {
					return;
				}
				const variable = ASTUtils.findVariable(scopeFor(node), node.id.name);
				if (!variable) {
					return;
				}
				// If the variable is reassigned, a read may resolve to a different subquery than the one
				// declared here, so we cannot know which handle it hits — bail rather than risk a false positive.
				if (variable.references.some((reference) => reference.isWrite() && reference.identifier !== node.id)) {
					return;
				}

				const referencedFields = new Set<string>();
				let selectAll = false;
				for (const reference of variable.references) {
					const id = reference.identifier;
					if (id === node.id) {
						continue;
					}
					const parent = id.parent;
					if (parent && parent.type === 'MemberExpression' && parent.object === id) {
						// `sub.field` or `sub['field']`
						if (parent.property.type === 'Identifier' && !parent.computed) {
							referencedFields.add(parent.property.name);
						} else if (
							parent.computed && parent.property.type === 'Literal' && typeof parent.property.value === 'string'
						) {
							referencedFields.add(parent.property.value);
						}
					} else if (isSelectAllReference(id)) {
						selectAll = true;
					}
				}

				for (const [fieldName, sqlNodes] of rawFields) {
					if (!selectAll && !referencedFields.has(fieldName)) {
						continue;
					}
					for (const sqlNode of sqlNodes) {
						context.report({
							node: sqlNode,
							messageId: 'enforceAliasInSubquery',
							data: { name: fieldName },
							fix: (fixer) => fixer.insertTextAfter(sqlNode, `.as('${fieldName}')`),
						});
					}
				}
			},
		};
	},
});

export default rule;
