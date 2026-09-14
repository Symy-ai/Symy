// @ts-check
// Rule: require-json-helper-in-authenticated-routes
// Prevents: Token refresh loss — NextResponse.json without mergeCookies
//
// In API routes that call createAuthenticatedClient, all JSON responses
// must use the `json()` helper (which auto-merges cookies) instead of
// `NextResponse.json()` (which loses refreshed auth tokens).
//
// This rule flags `NextResponse.json(...)` calls that are NOT wrapped with
// `mergeCookies(...)` in files that use `createAuthenticatedClient`.

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require json() helper (auto-merges cookies) instead of NextResponse.json in authenticated API routes',
      category: 'Architecture',
      recommended: true,
    },
    schema: [],
    messages: {
      useJsonHelper:
        'Use the `json()` helper from createAuthenticatedClient instead of NextResponse.json. ' +
        'NextResponse.json without mergeCookies loses refreshed auth tokens. ' +
        'Replace: `return NextResponse.json(data, opts)` → `return json(data, opts)`',
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();
    const filePath = context.filename || '';

    // Only apply to API route files
    if (!filePath.includes('/api/') && !filePath.includes('\\api\\')) return {};
    if (!filePath.endsWith('route.ts') && !filePath.endsWith('route.tsx')) return {};

    let usesCreateAuthenticatedClient = false;
    let usesWithAuth = false;
    let authCallLine = -1;

    return {
      // Detect if the file uses createAuthenticatedClient (but NOT through withAuth)
      // 🔧 Round 124: withAuth HOF auto-merges cookies, so NextResponse.json is safe.
      //    Don't flag routes that use withAuth (they don't need mergeCookies/json helper).
      Program(node) {
        const source = sourceCode.getText();
        usesWithAuth = source.includes('withAuth(') || source.includes('= withAuth');

        if (source.includes('createAuthenticatedClient')) {
          usesCreateAuthenticatedClient = true;
          // Find the line where it's called
          const lines = source.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('createAuthenticatedClient')) {
              authCallLine = i;
              break;
            }
          }
        }
      },

      CallExpression(node) {
        if (!usesCreateAuthenticatedClient) return;
        // 🔧 Round 124: Skip if route uses withAuth (HOF auto-merges cookies)
        if (usesWithAuth) return;

        // 🔧 Round 124: Skip if route uses createAdminClient (admin paths don't refresh user cookies)
        const source = sourceCode.getText();
        if (source.includes('createAdminClient')) return;

        // Check if this is a NextResponse.json call
        const callee = node.callee;
        if (!callee) return;

        // Match: NextResponse.json(...)
        if (callee.type === 'MemberExpression' &&
            callee.object?.name === 'NextResponse' &&
            callee.property?.name === 'json') {

          // Check if it's wrapped in mergeCookies
          // Look at the parent — if it's a mergeCookies call, it's OK
          const parent = node.parent;
          if (parent && parent.type === 'CallExpression') {
            const parentCallee = parent.callee;
            if (parentCallee?.type === 'Identifier' && parentCallee.name === 'mergeCookies') {
              return; // OK — wrapped with mergeCookies
            }
          }

          // Check if this is BEFORE the createAuthenticatedClient call (early return)
          const nodeLine = node.loc?.start.line - 1 || 0;
          if (nodeLine < authCallLine) {
            return; // OK — before auth, no pending cookies
          }

          // Check if json helper is destructured from createAuthenticatedClient
          // If the file has `json` in the destructuring, flag unwrapped NextResponse.json
          const source = sourceCode.getText();
          if (source.includes('{') && source.includes('json') && source.includes('createAuthenticatedClient')) {
            context.report({
              node,
              messageId: 'useJsonHelper',
            });
          }
        }
      },
    };
  },
};
