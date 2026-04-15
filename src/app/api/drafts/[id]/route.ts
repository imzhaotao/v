import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cuoadvkafpjyeasyribj.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Z3qks5beCk-7SwUTHZ_A9g_ohX4LeUE'
);

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

  if (error || !data) {
    return NextResponse.json({ error: 'Draft 不存在' }, { status: 404 });
  }

  return NextResponse.json({
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
    generationMeta: data.generation_meta || {
      model: data.model_used || '',
      version: '1.0',
      lastGeneratedAt: data.updated_at,
      warnings: [],
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.storySummary) updates.story_summary = body.storySummary;
  if (body.scenes) updates.scenes = body.scenes;
  if (body.status) updates.status = body.status;

  const { error } = await supabase.from('drafts').update(updates).eq('id', id);

  if (error) {
    return NextResponse.json({ error: '更新失败：' + error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { error } = await supabase.from('drafts').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: '删除失败：' + error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
