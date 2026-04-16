import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer as supabase } from '@/lib/supabase-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateDraftBody {
  storySummary?: unknown;
  scenes?: unknown;
  status?: string;
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'code' in error.cause &&
    (error.cause as { code?: string }).code === 'ENOTFOUND'
  ) {
    const hostname =
      'hostname' in error.cause && typeof (error.cause as { hostname?: string }).hostname === 'string'
        ? (error.cause as { hostname?: string }).hostname
        : 'Supabase host';
    return `无法连接到 Supabase：域名解析失败（${hostname}）。请检查 .env.local 里的 NEXT_PUBLIC_SUPABASE_URL 是否正确，或确认该 Supabase 项目仍然存在。`;
  }

  return error instanceof Error ? error.message : '数据库请求失败';
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
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
  } catch (error: unknown) {
    return NextResponse.json({ error: '读取失败：' + getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: UpdateDraftBody = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.storySummary) updates.story_summary = body.storySummary;
    if (body.scenes) updates.scenes = body.scenes;
    if (body.status) updates.status = body.status;

    const { error } = await supabase.from('drafts').update(updates).eq('id', id);

    if (error) {
      return NextResponse.json({ error: '更新失败：' + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: '更新失败：' + getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const { error } = await supabase.from('drafts').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: '删除失败：' + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: '删除失败：' + getErrorMessage(error) }, { status: 500 });
  }
}
