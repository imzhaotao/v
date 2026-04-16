import { NextRequest, NextResponse } from 'next/server';
import { generateCharacterImage, uploadImageToSupabase } from '@/lib/image-generator';

export async function POST(request: NextRequest) {
  try {
    const { characterName, description, draftId, characterId } = await request.json();

    if (!characterName || !description || !draftId || !characterId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. 生成图片
    const imgResult = await generateCharacterImage(
      characterName,
      description,
      `Story characters for ${characterName}`
    );

    if (imgResult.error || !imgResult.url) {
      return NextResponse.json({ error: imgResult.error || 'Image generation failed' }, { status: 500 });
    }

    // 2. 上传到 Supabase Storage
    const path = `characters/${draftId}/${characterId}.jpg`;
    const uploadResult = await uploadImageToSupabase(imgResult.url, 'story-video', path);

    if (uploadResult.error || !uploadResult.url) {
      return NextResponse.json({ error: uploadResult.error || 'Upload failed' }, { status: 500 });
    }

    return NextResponse.json({ url: uploadResult.url });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
