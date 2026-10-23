export const DEFAULT_DEALERSHIP_NAME = "Suivia Auto";

export function displayDealershipName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_DEALERSHIP_NAME;
}

export function parseDealershipList(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
  }
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
