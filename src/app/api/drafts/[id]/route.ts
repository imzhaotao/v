import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/drafts/[id] - 获取 Draft
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
  }

  // 转换成前端期望的格式
  const draft = {
    id: data.id,
    status: data.status,
    source: {
      language: data.language || 'zh',
      title: data.title,
      storyText: data.story_text,
    },
    storySummary: data.story_summary || {
      title: data.title || '未命名',
      genre: '',
      tone: '',
      theme: '',
      estimatedDurationSec: 0,
      characters: [],
    },
    scenes: data.scenes || [],
    generationMeta: data.generation_meta || {
      model: data.model_used || '',
      version: '1.0',
      lastGeneratedAt: data.updated_at,
      warnings: [],
    },
  };

  return NextResponse.json(draft);
}

// PATCH /api/drafts/[id] - 更新 Draft
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('drafts')
      .select('id')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.storySummary) updates.story_summary = body.storySummary;
    if (body.scenes) updates.scenes = body.scenes;
    if (body.status) updates.status = body.status;

    const { error: updateError } = await supabase
      .from('drafts')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/drafts/[id] - 删除 Draft
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { error } = await supabase
    .from('drafts')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
