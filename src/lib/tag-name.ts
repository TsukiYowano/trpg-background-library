export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function canonicalTagName(value: string) {
  return normalizeTagName(value).toLocaleLowerCase("ja-JP");
}
