// @ts-check
// Symy AI — Custom ESLint plugin for architectural guardrails.
// These rules prevent the bug classes identified in the Round 101 audit:
//   F1: race condition in async callbacks (no in-flight guard)
//   F2: hooks firing API calls before auth ready (401 storm)
//   F3: optimistic concurrency 409 conflicts (PUT /state)
//   F8: swallowed errors (warn-only catch blocks)

import noRawFetchInUseEffect from './no-raw-fetch-in-use-effect.mjs';
import requireAuthGateOnApiQuery from './require-auth-gate-on-api-query.mjs';
import noAsyncCallbackMutation from './no-async-callback-mutation.mjs';
import noPutStateEndpoints from './no-put-state-endpoints.mjs';
import noWarnOnlyCatch from './no-warn-only-catch.mjs';
import requireJsonHelperInAuthenticatedRoutes from './require-json-helper-in-authenticated-routes.mjs';

export default {
  meta: {
    name: 'eslint-plugin-symy',
    version: '1.0.0',
  },
  rules: {
    'no-raw-fetch-in-use-effect': noRawFetchInUseEffect,
    'require-auth-gate-on-api-query': requireAuthGateOnApiQuery,
    'no-async-callback-mutation': noAsyncCallbackMutation,
    'no-put-state-endpoints': noPutStateEndpoints,
    'no-warn-only-catch': noWarnOnlyCatch,
    'require-json-helper-in-authenticated-routes': requireJsonHelperInAuthenticatedRoutes,
  },
};
