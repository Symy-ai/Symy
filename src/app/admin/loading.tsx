/**
 * Loading state for admin route segment
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin" />
        <p className="text-sm text-gray-500">Loading admin...</p>
      </div>
    </div>
  );
}
