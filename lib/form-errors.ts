// A field's error from the last save stays until the student edits that
// field; after that it's out of date (the value it described is gone), so
// it's hidden. Found in the logged-in test pass: a grade error stayed on
// screen after the grade was fixed, until the next save.
//
// `edited` holds field names (an input's name, or its id for inputs whose
// value is sent through hidden inputs, like the majors list).
export function withoutEdited<T extends Record<string, string | undefined>>(errors: T, edited: ReadonlySet<string>): T {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => !edited.has(field))) as T;
}

// The field an input event came from.
export function fieldOf(target: EventTarget | null): string | null {
  if (!target || !("name" in target || "id" in target)) return null;
  const el = target as { name?: string; id?: string };
  return el.name || el.id || null;
}
