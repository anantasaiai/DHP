const SLUG_RE = /^[a-z0-9-]{2,48}$/;

export const SlugPolicy = {
  isValid: (slug: string): boolean => SLUG_RE.test(slug),
  errorMessage: 'Slug must be 2–48 lowercase alphanumeric/dash characters',
} as const;
