import { NextRequest, NextResponse } from 'next/server';
import { runGenerationPipeline, generateDraftId, getDraft } from '@/lib/pipeline';

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4';

async function llmCall(prompt: string): Promise<string> {
  // 通用 LLM 调用接口
  // 可以对接 OpenAI / DeepSeek / MiniMax
  const response = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API 调用失败：${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// GET /api/drafts - 列出所有 Draft
export async function GET() {
  // 第一阶段暂时返回空列表
  return NextResponse.json({ drafts: [] });
}

// POST /api/drafts - 创建新 Draft
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storyText, language = 'zh', title } = body;

    if (!storyText || storyText.trim().length < 50) {
      return NextResponse.json(
        { error: '故事文本至少需要 50 个字符' },
        { status: 400 }
      );
    }

    if (storyText.length > 50000) {
      return NextResponse.json(
        { error: '故事文本不能超过 50000 字符' },
        { status: 400 }
      );
    }

    const draftId = generateDraftId();

    // 启动异步生成
    runGenerationPipeline({
      draftId,
      storyText: storyText.trim(),
      language,
      title,
      llmCall,
    }).catch(console.error);

    return NextResponse.json({
      id: draftId,
      status: 'generating',
    }, { status: 201 });

  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || '创建 Draft 失败' },
      { status: 500 }
    );
  }
}
