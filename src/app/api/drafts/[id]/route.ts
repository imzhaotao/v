import { NextRequest, NextResponse } from 'next/server';
import { generateDraftId } from '@/lib/pipeline';

// 共享内存存储
const memoryStore = new Map<string, any>();

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/drafts/[id]
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // 先从内存查
  if (memoryStore.has(id)) {
    return NextResponse.json(memoryStore.get(id));
  }

  // TODO: 从 Supabase 查询（网络恢复后启用）
  return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
}

// PATCH /api/drafts/[id] - 更新
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!memoryStore.has(id)) {
    return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
  }

  const body = await request.json();
  const draft = memoryStore.get(id);

  if (body.storySummary) draft.storySummary = { ...draft.storySummary, ...body.storySummary };
  if (body.scenes) draft.scenes = body.scenes;
  if (body.status) draft.status = body.status;

  memoryStore.set(id, draft);

  return NextResponse.json({ success: true });
}

// DELETE /api/drafts/[id]
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  memoryStore.delete(id);
  return NextResponse.json({ success: true });
}
