// "[Client Name]"-style gaps the AI leaves when it doesn't know a fact.
// The capturing group means text.split(PLACEHOLDER) keeps the placeholders at odd indexes.
export const PLACEHOLDER = /(\[[^\]\n]{1,60}\])/g;

/** Unique placeholders still present in the text, in the order they first appear. */
export function findPlaceholders(...texts: string[]): string[] {
  const found = texts.join('\n').match(PLACEHOLDER) ?? [];
  return [...new Set(found)];
}

/** Replace every occurrence of one placeholder, e.g. "[Client Name]" -> "Rahul". */
export function fillPlaceholder(text: string, placeholder: string, value: string): string {
  return text.split(placeholder).join(value);
}

/** "[Client Name]" -> "Client Name", for input labels. */
export const placeholderLabel = (p: string) => p.slice(1, -1);
