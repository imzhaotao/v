import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { generateDraftId } from '@/lib/pipeline';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { generateCharacterImage } from '@/lib/image-generator';
import type { Scene, Shot, StoryDraft, TimeOfDay } from '@/types/draft';

const deepseek = createDeepSeek({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-14dc552758e14c9387e6d2d0c3734bf2',
});

const MODEL_CONFIG = {
  deepseek: { provider: deepseek, model: 'deepseek-chat' },
  minimax: {
    provider: createOpenAI({
      baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
      apiKey: process.env.MINIMAX_API_KEY || '',
    }),
    model: 'MiniMax-M2.7',
  },
} as const;

type ModelType = keyof typeof MODEL_CONFIG;
type Language = StoryDraft['source']['language'];

interface PromptCharacter {
  name: string;
  description: string;
}

interface PromptScene {
  location: string;
  timeOfDay?: TimeOfDay;
  summary: string;
}

interface AnalysisResult {
  title: string;
  genre: string;
  tone: string;
  theme: string;
  estimatedDurationSec: number;
  characters: PromptCharacter[];
  scenes: PromptScene[];
}

type GeneratedShot = Partial<
  Pick<Shot, 'sequence' | 'purpose' | 'durationSec' | 'shotType' | 'cameraAngle' | 'cameraMovement' | 'visualDescription' | 'emotion'>
>;

type GeneratedScene = Pick<Scene, 'id' | 'sequence' | 'location' | 'timeOfDay' | 'summary' | 'shots'>;

interface CreateDraftBody {
  storyText?: string;
  language?: Language;
  title?: string;
  model?: string;
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

  return error instanceof Error ? error.message : '生成失败';
}

const STORY_ANALYSIS_PROMPT = `你是一个专业的电影分镜师。分析以下故事，输出JSON。

要求：
1. 根据故事内容自动生成一个简洁有力的标题（不要用"未命名"或"无题"）
2. 识别所有角色（最多5个），给出名称和简述
3. 划分场景（最多4个），每个场景包含地点、时间和概述
4. 估算总时长（分钟）

输出严格JSON：
{
  "title": "标题",
  "genre": "类型",
  "tone": "风格",
  "theme": "主题",
  "estimatedDurationSec": 120,
  "characters": [{"name": "角色名", "description": "描述"}],
  "scenes": [{"location": "地点", "timeOfDay": "day|night|dusk|unknown", "summary": "场景描述"}]
}

故事文本：
{storyText}

JSON：`;

const SHOT_EXPANSION_PROMPT = `根据以下场景信息，生成2-3个分镜。

场景：{location} / {timeOfDay}
描述：{summary}
角色：{characters}

每个分镜输出JSON：
{
  "sequence": 1,
  "purpose": "establishing|action|reaction|transition|closeup",
  "durationSec": 10-25,
  "shotType": "远景|全景|中景|近景|特写",
  "cameraAngle": "平视|仰视|俯视",
  "cameraMovement": "固定|推|拉|摇|移|跟",
  "visualDescription": "详细画面描述",
  "emotion": "平静|紧张|悬疑|欢快|悲伤|戏剧性"
}

只输出JSON数组，不要其他文字：`;

function buildScenePrompt(scene: PromptScene, characters: PromptCharacter[]): string {
  const charStr = characters.map(c => c.name).join('、') || '主角';
  return SHOT_EXPANSION_PROMPT
    .replace('{location}', scene.location)
    .replace('{timeOfDay}', scene.timeOfDay || 'unknown')
    .replace('{summary}', scene.summary)
    .replace('{characters}', charStr);
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    // Try direct parse first
    try { return JSON.parse(text); } catch {}

    // Strip content between <think> and </think> (MiniMax thinking blocks)
    const withoutThinking = text.replace(/<think>[\s\S]*?\/>/g, '');
    const stripped = withoutThinking.trim();
    try { return JSON.parse(stripped); } catch {}

    // Try to find JSON array in text (for shots)
    const arrStart = stripped.indexOf('[');
    const arrEnd = stripped.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      const arrText = stripped.slice(arrStart, arrEnd + 1);
      const parsed = JSON.parse(arrText) as unknown;
      if (Array.isArray(parsed)) return parsed as T;
    }

    // Try to find JSON object in text (for analysis)
    const objStart = stripped.indexOf('{');
    const objEnd = stripped.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      const objText = stripped.slice(objStart, objEnd + 1);
      const parsed = JSON.parse(objText);
      // Ensure characters not empty
      if (Array.isArray(parsed?.characters) && parsed.characters.length === 0) {
        parsed.characters = [{ name: '主角', description: '故事中的主要人物' }];
      }
      return parsed;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function buildPromptText(shot: GeneratedShot, platform: string): string {
  const { shotType, cameraAngle, cameraMovement, visualDescription, emotion } = shot;
  const prefix = platform === 'kling' ? 'Cinematic video' : platform === 'runway' ? 'Film still' : 'Cinematic scene';
  return `${prefix}, ${shotType || '中景'}, ${cameraAngle || '平视'}, ${cameraMovement || '固定'} shot, ${visualDescription || ''}, ${emotion || '平静'} mood`.trim();
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('drafts')
      .select('id, title, story_text, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: '数据库读取失败：' + error.message }, { status: 500 });
    }

    return NextResponse.json({ drafts: data || [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: '数据库读取失败：' + getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      let draftId = '';

      try {
        const body: CreateDraftBody = await request.json();
        const { storyText, language = 'zh', title, model = 'deepseek' } = body;

        if (!storyText || storyText.trim().length < 20) {
          send({ error: '故事文本至少需要 20 个字符' });
          controller.close();
          return;
        }

        if (storyText.length > 100000) {
          send({ error: '故事文本不能超过 100000 字符' });
          controller.close();
          return;
        }

        const modelType = model in MODEL_CONFIG ? model : 'deepseek';
        const config = MODEL_CONFIG[modelType as ModelType];
        const modelInstance = config.provider.chat(config.model);

        draftId = generateDraftId();
        send({ type: 'start', draftId, status: 'analyzing' });

        // 创建数据库记录
        const { error: insertError } = await supabase.from('drafts').insert({
          id: draftId,
          title: title || null,
          story_text: storyText,
          language,
          status: 'generating',
          model_used: modelType,
          story_summary: null,
          scenes: [],
          generation_meta: { model: config.model, version: '1.0' },
        });

        if (insertError) {
          send({ error: '数据库写入失败：' + insertError.message });
          controller.close();
          return;
        }

        // Step 1: 故事分析
        const analysisPrompt = STORY_ANALYSIS_PROMPT.replace('{storyText}', storyText.slice(0, 30000));
        const { text: rawAnalysisText } = await generateText({
          model: modelInstance,
          messages: [{ role: 'user', content: analysisPrompt }],
          maxOutputTokens: 4096,
          temperature: 0.7,
        });
        const analysisText = rawAnalysisText.replace(/```(?:json)?\n?/gi, '').trim();

        const analysis = parseJson(analysisText, {
          title: title || '故事',
          genre: '剧情',
          tone: '写实',
          theme: '人生',
          estimatedDurationSec: 120,
          characters: [{ name: '主角', description: '故事中的主要人物' }],
          scenes: [{ location: '未知', timeOfDay: 'unknown', summary: storyText.slice(0, 200) }],
        } satisfies AnalysisResult);

        send({ type: 'analysis', data: analysis, status: 'expanding' });
        send({ type: 'debug', message: `analysis parsed: title=${analysis.title}, characters=${analysis.characters?.length}, scenes=${analysis.scenes?.length}` });

        // Step 2: 分镜扩展
        const characters = (analysis.characters && analysis.characters.length > 0)
          ? analysis.characters
          : [{ name: '主角', description: '故事中的主要人物' }];

        // 立即发送角色数据，让前端增量渲染
        send({ type: 'characters', characters, status: 'expanding' });

        const scenes: GeneratedScene[] =
          (analysis.scenes || []).map((s, i) => ({
            id: `scene_${i + 1}`,
            sequence: i + 1,
            location: s.location,
            timeOfDay: s.timeOfDay || 'unknown',
            summary: s.summary,
            shots: [] as Shot[],
          }));

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          send({ type: 'scene_progress', sceneIndex: i, totalScenes: scenes.length, status: 'expanding' });

          const scenePrompt = buildScenePrompt(scene, characters);
          try {
            const { text: shotsText } = await generateText({
              model: modelInstance,
              messages: [{ role: 'user', content: scenePrompt }],
              maxOutputTokens: 2048,
              temperature: 0.7,
            });

            // 预处理：去掉 markdown 代码块标记
            const cleanedText = shotsText.replace(/```(?:json)?\n?/gi, '').replace(/```\n?/gi, '').trim();
            const shotsData = parseJson<GeneratedShot[]>(cleanedText, []);
            send({ type: 'debug', message: `[scene${i+1}] raw length=${shotsText.length}, cleaned length=${cleanedText.length}, parsed shots=${shotsData.length}, first 100 chars: ${cleanedText.slice(0, 200)}` });
            if (Array.isArray(shotsData)) {
              scene.shots = shotsData.map((shot, j) => ({
                id: `shot_${i + 1}_${j + 1}`,
                ...shot,
                subjects: characters.slice(0, 2).map((_, idx) => `char_${idx + 1}`),
                platformPrompts: {
                  kling: { text: buildPromptText(shot, 'kling'), status: 'ready' },
                  runway: { text: buildPromptText(shot, 'runway'), status: 'ready' },
                  sora: { text: buildPromptText(shot, 'sora'), status: 'ready' },
                },
                meta: { aiGenerated: true, userEditedFields: [] },
              })) as Shot[];
              // 场景分镜生成完，发送完整数据
              send({ type: 'scene_done', scene: { ...scene, shots: scene.shots }, sceneIndex: i, totalScenes: scenes.length, status: 'expanding' });
            }
          } catch (error: unknown) {
            console.error(`Scene ${i + 1} expansion failed:`, error);
          }
        }

        // Step 3: 为每个角色生成图片
        const charactersWithImages = await Promise.all(
          characters.map(async (c, i) => {
            const charId = `char_${i + 1}`;
            try {
              const imgResult = await generateCharacterImage(
                c.name,
                c.description,
                `Story: ${analysis.title || title || '未命名'}`
              );
              if (imgResult.url) {
                return { id: charId, name: c.name, description: c.description, imageUrl: imgResult.url };
              }
            } catch {}
            return { id: charId, name: c.name, description: c.description };
          })
        );

        const storySummary = {
          title: analysis.title || title || '未命名',
          genre: analysis.genre,
          tone: analysis.tone,
          theme: analysis.theme,
          estimatedDurationSec: analysis.estimatedDurationSec || 120,
          characters: charactersWithImages,
        };

        // 更新数据库
        const { error: updateError } = await supabase
          .from('drafts')
          .update({
            title: storySummary.title,
            story_summary: storySummary,
            scenes,
            status: 'ready',
            generation_meta: { model: config.model, version: '1.0', lastGeneratedAt: new Date().toISOString(), warnings: [] },
          })
          .eq('id', draftId);

        if (updateError) {
          send({ error: '数据库更新失败：' + updateError.message });
          controller.close();
          return;
        }

        const draft = {
          id: draftId,
          status: 'ready',
          source: { language, title, storyText },
          storySummary,
          scenes,
          generationMeta: { model: config.model, version: '1.0', lastGeneratedAt: new Date().toISOString(), warnings: [] },
        };

        send({ type: 'done', draft });

      } catch (error: unknown) {
        console.error('Stream error:', error);
        if (draftId) {
          await supabase.from('drafts').update({ status: 'failed' }).eq('id', draftId);
        }
        send({ error: getErrorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
