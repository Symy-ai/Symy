// @ts-check
// Rule: no-async-callback-mutation
// Prevents: F1 — useCallback(async () => apiFetch(...)) without in-flight guard
//
// Flags `useCallback(async () => { ... apiFetch/fetch ... })` patterns where
// the callback is a network mutation but has no in-flight ref guard.
// This pattern causes race conditions when the callback is invoked rapidly
// (e.g., button clicks) — multiple requests fire and the later ones 409.
//
// The fix is to use `useMutation` (which has built-in `isPending`) or add
// an explicit `inFlightRef` guard.

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Flag useCallback(async () => apiFetch(...)) without in-flight guard — use useMutation instead (prevents F1: race condition)',
      category: 'Architecture',
      recommended: true,
    },
    schema: [],
    messages: {
      asyncCallbackMutation:
        'useCallback returns an async function that calls {{fn}} with method {{method}}. ' +
        'This pattern is prone to race conditions when invoked rapidly (F1). ' +
        'Prefer useMutation (has built-in isPending) or add an inFlightRef guard. ' +
        'If this is safe (e.g., idempotent GET or has dedup), add: ' +
        '// eslint-disable-next-line symy/no-async-callback-mutation',
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    function isUseCallbackCall(node) {
      const callee = node.callee;
      if (!callee) return false;
      if (callee.type === 'Identifier' && callee.name === 'useCallback') return true;
      if (callee.type === 'MemberExpression' && callee.property?.name === 'useCallback') return true;
      return false;
    }

    return {
      // Use ESLint selector to find: useCallback(async (args) => { ... CallExpression ... }, deps)
      // Selector matches CallExpression whose callee is useCallback and first arg is async ArrowFunctionExpression
      'CallExpression[callee.name="useCallback"] > ArrowFunctionExpression[async=true]'(arrowNode) {
        const callback = arrowNode;
        const source = sourceCode.getText(callback);

        // Check for network mutation calls (POST/PUT/DELETE/PATCH) using regex on source
        // This is simpler and avoids AST recursion issues
        const mutationPattern = /\b(fetch|apiFetch|apiFetchVoid)\s*\([^)]*method\s*:\s*['"](POST|PUT|DELETE|PATCH)['"]/;
        const match = source.match(mutationPattern);
        if (!match) return;

        const fnName = match[1];
        const method = match[2];

        // Check if there's an in-flight guard
        // Look for: ref.current = true/false, isPending, isMutating, inFlight, inProgress
        const hasGuard = /(\w+Ref\.current\s*[=!]=)|(\bisPending\b)|(\bisMutating\b)|(\binFlight\b)|(\binProgress\b)/.test(source);

        if (hasGuard) return;

        context.report({
          node: callback,
          messageId: 'asyncCallbackMutation',
          data: { fn: fnName, method },
        });
      },
    };
  },
};
