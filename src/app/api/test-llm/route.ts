import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';

export async function GET() {
  const deepseek = createDeepSeek({
    baseURL: 'https://api.deepseek.com',
    apiKey: 'sk-14dc552758e14c9387e6d2d0c3734bf2',
  });

  try {
    const { text } = await generateText({
      model: deepseek.chat('deepseek-chat'),
      messages: [{ role: 'user', content: 'say hi in 5 words' }],
      maxOutputTokens: 20,
    });
    return NextResponse.json({ success: true, text });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, stack: e.stack }, { status: 500 });
  }
}
