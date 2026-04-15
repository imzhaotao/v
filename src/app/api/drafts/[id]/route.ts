import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuoadvkafpjyeasyribj.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Z3qks5beCk-7SwUTHZ_A9g_ohX4LeUE'
);

// 共享内存存储（降级用）
const memoryStore = new Map<string, any>();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', id)
    .single();

  if (!error && data) {
    const draft = {
      id: data.id,
      status: data.status,
      source: { language: data.language || 'zh', title: data.title, storyText: data.story_text },
      storySummary: data.story_summary || {
        title: data.title || '未命名',
        genre: '',
        tone: '',
        theme: '',
        estimatedDurationSec: 0,
        characters: [],
      },
      scenes: data.scenes || [],
      generationMeta: data.generation_meta || { model: data.model_used || '', version: '1.0', lastGeneratedAt: data.updated_at, warnings: [] },
    };
    return NextResponse.json(draft);
  }

  // 降级到内存
  if (memoryStore.has(id)) {
    return NextResponse.json(memoryStore.get(id));
  }

  return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.storySummary) updates.story_summary = body.storySummary;
  if (body.scenes) updates.scenes = body.scenes;
  if (body.status) updates.status = body.status;

  const { error } = await supabase
    .from('drafts')
    .update(updates)
    .eq('id', id);

  if (!error) {
    return NextResponse.json({ success: true });
  }

  // 降级到内存
  if (memoryStore.has(id)) {
    const draft = memoryStore.get(id);
    if (body.storySummary) draft.storySummary = { ...draft.storySummary, ...body.storySummary };
    if (body.scenes) draft.scenes = body.scenes;
    if (body.status) draft.status = body.status;
    memoryStore.set(id, draft);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  await supabase.from('drafts').delete().eq('id', id);
  memoryStore.delete(id);
  return NextResponse.json({ success: true });
}
