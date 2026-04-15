import { NextRequest, NextResponse } from 'next/server';
import { getDraft, updateDraft } from '@/lib/pipeline';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/drafts/[id] - 获取 Draft
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const draft = getDraft(id);

  if (!draft) {
    return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
  }

  return NextResponse.json(draft);
}

// PATCH /api/drafts/[id] - 更新 Draft 部分字段
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const draft = getDraft(id);
    if (!draft) {
      return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
    }

    // 允许更新的字段
    const allowedUpdates: Partial<typeof draft> = {};

    if (body.storySummary) {
      allowedUpdates.storySummary = {
        ...draft.storySummary,
        ...body.storySummary,
      };
    }

    if (body.scenes) {
      // 更新 scenes 时，保留原有的 id 和 meta
      allowedUpdates.scenes = body.scenes.map((scene: any, i: number) => ({
        ...draft.scenes[i],
        ...scene,
        id: draft.scenes[i]?.id || scene.id,
        shots: scene.shots?.map((shot: any, j: number) => ({
          ...draft.scenes[i]?.shots[j],
          ...shot,
          id: draft.scenes[i]?.shots[j]?.id || shot.id,
        })),
      }));
    }

    const updated = updateDraft(id, allowedUpdates);
    return NextResponse.json(updated);

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
