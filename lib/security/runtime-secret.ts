export function resolveRuntimeSecret(
  name: string,
  configured: string | undefined,
  developmentFallback: string,
  isProduction: boolean = process.env.NODE_ENV === "production",
): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;

  if (isProduction) {
    throw new Error(`${name} is required in production`);
  }

  return developmentFallback;
}
