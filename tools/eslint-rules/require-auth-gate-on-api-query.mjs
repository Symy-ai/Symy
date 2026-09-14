// @ts-check
// Rule: require-auth-gate-on-api-query
// Prevents: F2 regression — useQuery hitting /api/ without `enabled: !!user`
//
// Requires all `useQuery` calls whose `queryFn` references `/api/` to have
// `enabled` that references the user/auth state (prevents 401 on cold load).

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require useQuery hitting /api/ to have `enabled` referencing user/auth state (prevents F2: 401 storm)',
      category: 'Architecture',
      recommended: true,
    },
    schema: [],
    messages: {
      missingEnabled:
        'useQuery hitting /api/ must have `enabled` that gates on auth state (e.g., `enabled: !!user`). ' +
        'Without it, the query fires on cold load before auth is ready → 401 errors (F2).',
      enabledNotAuthGated:
        'useQuery hitting /api/ has `enabled` but it does not reference user/auth/session state. ' +
        'This will still fire 401s on cold load (F2). Use `enabled: !!user` or `enabled: isDemo || !!user`.',
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    function isUseQueryCall(node) {
      const callee = node.callee;
      if (!callee) return false;
      if (callee.type === 'Identifier' && callee.name === 'useQuery') return true;
      if (callee.type === 'MemberExpression' && callee.property?.name === 'useQuery') return true;
      return false;
    }

    return {
      CallExpression(node) {
        if (!isUseQueryCall(node)) return;

        // Get the options object (first argument)
        const opts = node.arguments[0];
        if (!opts || opts.type !== 'ObjectExpression') return;

        // Find queryFn
        const queryFnProp = opts.properties.find(p =>
          (p.type === 'Property') && (p.key?.name === 'queryFn' || p.key?.value === 'queryFn')
        );
        if (!queryFnProp) return;

        // Check if queryFn references /api/
        const queryFnSource = sourceCode.getText(queryFnProp.value);
        if (!queryFnSource.includes('/api/')) return;

        // Find enabled property
        const enabledProp = opts.properties.find(p =>
          (p.type === 'Property') && (p.key?.name === 'enabled' || p.key?.value === 'enabled')
        );

        if (!enabledProp) {
          context.report({
            node: opts,
            messageId: 'missingEnabled',
          });
          return;
        }

        // Check if enabled references user/auth/session
        const enabledSource = sourceCode.getText(enabledProp.value);
        if (!/\b(user|auth|session|isAuthenticated|isDemo)\b/.test(enabledSource)) {
          context.report({
            node: enabledProp,
            messageId: 'enabledNotAuthGated',
          });
        }
      },
    };
  },
};
