import { createOpenAI } from '@ai-sdk/openai';

export const minimax = createOpenAI({
  baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
  apiKey: process.env.MINIMAX_API_KEY || '',
});
