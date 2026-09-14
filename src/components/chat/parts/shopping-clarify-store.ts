const STORAGE_KEY = 'symy_shopping_clarify_asked';

export function readAskedShoppingSubjects(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    // safe to ignore: unreadable session storage only disables one-per-session deduping
    return [];
  }
}

export function markShoppingSubjectAsked(subject: string): void {
  try {
    const current = readAskedShoppingSubjects();
    if (!current.some((item) => item.toLowerCase() === subject.toLowerCase())) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...current, subject]));
    }
  } catch {
    // safe to ignore: unwritable session storage only disables one-per-session deduping
    return;
  }
}
