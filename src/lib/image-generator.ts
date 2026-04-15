/**
 * MiniMax 文生图 API
 * 文档：https://www.minimaxi.com/document/Image%20Generation
 */
import { createOpenAI } from '@ai-sdk/openai';

const minimax = createOpenAI({
  baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
  apiKey: process.env.MINIMAX_API_KEY || '',
});

export interface ImageResult {
  url?: string;
  base64?: string;
  error?: string;
}

export async function generateCharacterImage(
  characterName: string,
  description: string,
  sceneContext?: string
): Promise<ImageResult> {
  const prompt = `${characterName}. ${description}. ${sceneContext || 'Upper body portrait, clean background, cinematic lighting, photorealistic, 4K'}`;
  return callMinimaxImage(prompt);
}

export async function generateSceneImage(
  location: string,
  timeOfDay: string,
  mood: string,
  description: string
): Promise<ImageResult> {
  const timeMap: Record<string, string> = {
    day: 'daytime, bright sunlight',
    night: 'night scene, moonlight',
    dusk: 'golden hour, sunset colors',
    unknown: 'neutral lighting',
  };
  const prompt = `${location}. ${timeMap[timeOfDay] || timeOfDay}. ${mood} mood. ${description}. Wide establishing shot, cinematic, photorealistic, 4K`;
  return callMinimaxImage(prompt);
}

export async function generateShotImage(
  visualDescription: string,
  emotion: string,
  shotType: string
): Promise<ImageResult> {
  const prompt = `Film still: ${visualDescription}. ${shotType} shot. ${emotion} mood. Cinematic, photorealistic, 4K`;
  return callMinimaxImage(prompt);
}

async function callMinimaxImage(prompt: string): Promise<ImageResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return { error: 'MINIMAX_API_KEY not configured' };

  try {
    const response = await fetch('https://api.minimaxi.com/v1/image_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'image-01',
        prompt,
        num_images: 1,
        aspect_ratio: '3:2',
        extra: {
          return_url: true,
        },
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      return { error: data.error?.message || `API error: ${response.status}` };
    }

    if (data.data?.[0]?.url) {
      return { url: data.data[0].url, base64: data.data[0].base64 };
    }

    return { error: 'No image URL in response' };

  } catch (e: any) {
    return { error: e.message };
  }
}
