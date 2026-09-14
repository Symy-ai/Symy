'use client';

/**
 * Admin error boundary — preserves admin layout (sidebar, topbar) when a page crashes.
 * Without this, a render error in any admin page replaces the entire shell with
 * the root error page, forcing admin to reload to navigate.
 *
 * 🔧 2026-07-15 (deep audit NEW #1): Created admin-level error boundary
 */

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Admin Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
          Page Error
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {error.message || 'An unexpected error occurred while rendering this admin page.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/admin'}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
