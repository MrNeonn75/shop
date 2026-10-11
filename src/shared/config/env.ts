/// <reference types="vite/client" />
import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('BRAND HOUSE ERP'),
  VITE_DATA_SOURCE: z.enum(['mock', 'http', 'legacy']).default('mock'),
  VITE_API_BASE_URL: z.string().url().default('http://localhost:8000/api/v1'),
  VITE_DEFAULT_LOCALE: z.enum(['az', 'en', 'ru']).default('az'),
  VITE_CURRENCY: z.string().default('AZN'),
  VITE_TIMEZONE: z.string().default('Asia/Baku'),
  VITE_BRAND_ACCENT: z.string().default('#111111'),
  VITE_MOCK_LATENCY_MS: z.coerce.number().default(350),
});

const parsedEnv = envSchema.safeParse(import.meta.env);

if (!parsedEnv.success) {
  console.error('❌ Environment configuration validation failed:', parsedEnv.error.format());
  throw new Error('Invalid environment configuration. Check your .env file.');
}

export const env = parsedEnv.data;
export type AppEnv = z.infer<typeof envSchema>;
