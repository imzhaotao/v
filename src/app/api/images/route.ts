import { NextRequest, NextResponse } from 'next/server';
import { generateCharacterImage, generateSceneImage, generateShotImage } from '@/lib/image-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...params } = body;

    let result;

    switch (type) {
      case 'character':
        result = await generateCharacterImage(
          params.characterName,
          params.description,
          params.sceneContext
        );
        break;

      case 'scene':
        result = await generateSceneImage(
          params.location,
          params.timeOfDay,
          params.mood,
          params.description
        );
        break;

      case 'shot':
        result = await generateShotImage(
          params.visualDescription,
          params.emotion,
          params.shotType
        );
        break;

      default:
        return NextResponse.json({ error: 'Invalid type. Use: character, scene, or shot' }, { status: 400 });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...result });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
