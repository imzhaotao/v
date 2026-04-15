import { createDeepSeek } from '@ai-sdk/deepseek';

export const deepseek = createDeepSeek({
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
});
