/**
 * MiniMax 文生图 API + 上传到 Supabase Storage
 * 文档：https://www.minimaxi.com/document/Image%20Generation
 */

export interface ImageResult {
  url?: string;
  base64?: string;
  error?: string;
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

/**
 * 下载图片并上传到 Supabase Storage，返回永久 URL
 */
export async function uploadImageToSupabase(
  imageUrl: string,
  bucket: string,
  path: string
): Promise<{ url?: string; error?: string }> {
  try {
    // 下载图片
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      return { error: `Failed to fetch image: ${imgResponse.status}` };
    }
    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 获取 content-type
    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

    // 上传到 Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { error: 'Missing Supabase credentials' };
    }

    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Authorization': `Bearer ${supabaseKey}`,
          'x-upsert': 'true',
        },
        body: buffer,
      }
    );

    if (!uploadResponse.ok) {
      return { error: `Upload failed: ${uploadResponse.status}` };
    }

    // 返回公开 URL
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
    return { url: publicUrl };

  } catch (e: any) {
    return { error: e.message };
  }
}
