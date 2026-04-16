import { NextRequest, NextResponse } from 'next/server';
import { uploadImageToSupabase } from '@/lib/image-generator';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, characterId } = await request.json();

    if (!imageUrl || !characterId) {
      return NextResponse.json({ error: 'Missing imageUrl or characterId' }, { status: 400 });
    }

    const path = `characters/${characterId}.jpg`;
    const result = await uploadImageToSupabase(imageUrl, 'story-video', path);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ url: result.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
