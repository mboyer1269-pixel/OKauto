function required(name: string, fallbackForDev?: string): string {
  const value = process.env[name];
  if (value && value.trim() !== "") return value;
  if (process.env.NODE_ENV !== "production" && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Missing required environment variable: ${name}`);
}

export const env = {
  get sessionSecret(): string {
    return required("SESSION_SECRET", "insecure-dev-secret-change-me");
  },
  get appUrl(): string {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get vinDecoderOnline(): boolean {
    return process.env.VIN_DECODER_ONLINE !== "false";
  },
  get openai(): { apiKey: string; model: string; baseUrl: string } | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return {
      apiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    };
  },
};
