import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';

const deepseek = createDeepSeek({
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-14dc552758e14c9387e6d2d0c3734bf2',
});

const MODEL_CONFIG = {
  deepseek: { provider: deepseek, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' },
  minimax: {
    provider: createOpenAI({
      baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
      apiKey: process.env.MINIMAX_API_KEY || '',
    }),
    model: process.env.MINIMAX_MODEL || 'MiniMax-M2.7',
  },
} as const;

type ModelType = keyof typeof MODEL_CONFIG;

const STORY_ANALYSIS_PROMPT = `你是一个专业的电影分镜师。分析以下故事，输出JSON。

要求：
1. 提取标题、类型、风格、主题
2. 识别所有角色（最多8个），给出名称和简述
3. 划分场景（最多6个），每个场景包含地点、时间和概述
4. 估算总时长（分钟）

输出严格JSON：
{
  "title": "标题",
  "genre": "类型",
  "tone": "风格",
  "theme": "主题",
  "estimatedDurationSec": 120,
  "characters": [{"Name": "角色名", "description": "描述"}],
  "scenes": [{"location": "地点", "timeOfDay": "day|night|dusk|unknown", "summary": "场景描述"}]
}

故事文本：
{storyText}

JSON：`;

// Shot Expansion
const SHOT_EXPANSION_PROMPT = `根据以下场景信息，生成3-5个分镜。

场景：{location} / {timeOfDay}
描述：{summary}
角色：{characters}

每个分镜输出JSON：
{
  "sequence": 1,
  "purpose": "establishing|action|reaction|transition|closeup",
  "durationSec": 3-8,
  "shotType": "远景|全景|中景|近景|特写",
  "cameraAngle": "平视|仰视|俯视",
  "cameraMovement": "固定|推|拉|摇|移|跟",
  "visualDescription": "详细画面描述",
  "emotion": "平静|紧张|悬疑|欢快|悲伤|戏剧性"
}

只输出JSON数组，不要其他文字：`;

function buildScenePrompt(scene: any, characters: any[]): string {
  const charStr = characters.map((c: any) => c.Name).join('、') || '主角';
  return SHOT_EXPANSION_PROMPT
    .replace('{location}', scene.location)
    .replace('{timeOfDay}', scene.timeOfDay)
    .replace('{summary}', scene.summary)
    .replace('{characters}', charStr);
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) return JSON.parse(match[1]);
  } catch {}
  return fallback;
}

function buildPromptText(shot: any, platform: string): string {
  const { shotType, cameraAngle, cameraMovement, visualDescription, emotion } = shot;
  const prefix = platform === 'kling' ? 'Cinematic video' : platform === 'runway' ? 'Film still' : 'Cinematic scene';
  return `${prefix}, ${shotType || '中景'}, ${cameraAngle || '平视'}, ${cameraMovement || '固定'} shot, ${visualDescription || ''}, ${emotion || '平静'} mood`.trim();
}

// POST /api/generate - 仅做 LLM 生成，返回完整数据
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const body = await request.json();
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

        send({ type: 'start' });

        // Step 1: 故事分析
        const analysisPrompt = STORY_ANALYSIS_PROMPT.replace('{storyText}', storyText.slice(0, 30000));
        const { text: analysisText } = await generateText({
          model: modelInstance,
          messages: [{ role: 'user', content: analysisPrompt }],
          maxOutputTokens: 4096,
          temperature: 0.7,
        });

        const analysis = parseJson(analysisText, {
          title: title || '未命名',
          genre: '剧情',
          tone: '写实',
          theme: '人生',
          estimatedDurationSec: 120,
          characters: [],
          scenes: [{ location: '未知', timeOfDay: 'unknown', summary: storyText.slice(0, 200) }],
        });

        send({ type: 'analysis', data: analysis });

        // Step 2: 分镜扩展
        const characters = analysis.characters || [];
        const scenes: Array<{ id: string; sequence: number; location: string; timeOfDay: string; summary: string; shots: any[] }> =
          (analysis.scenes || []).map((s: any, i: number) => ({
            id: `scene_${i + 1}`,
            sequence: i + 1,
            location: s.location,
            timeOfDay: s.timeOfDay || 'unknown',
            summary: s.summary,
            shots: [],
          }));

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          send({ type: 'scene_progress', sceneIndex: i, totalScenes: scenes.length });

          const scenePrompt = buildScenePrompt(scene, characters);
          try {
            const { text: shotsText } = await generateText({
              model: modelInstance,
              messages: [{ role: 'user', content: scenePrompt }],
              maxOutputTokens: 2048,
              temperature: 0.7,
            });

            const shotsData = parseJson<any[]>(shotsText, []);
            if (Array.isArray(shotsData)) {
              scene.shots = shotsData.map((shot, j) => ({
                id: `shot_${i + 1}_${j + 1}`,
                ...shot,
                subjects: characters.slice(0, 2).map((_: any, idx: number) => `char_${idx + 1}`),
                platformPrompts: {
                  kling: { text: buildPromptText(shot, 'kling'), status: 'ready' },
                  runway: { text: buildPromptText(shot, 'runway'), status: 'ready' },
                  sora: { text: buildPromptText(shot, 'sora'), status: 'ready' },
                },
                meta: { aiGenerated: true, userEditedFields: [] },
              }));
            }
          } catch (e: any) {
            console.error(`Scene ${i + 1} expansion failed:`, e);
          }
        }

        const storySummary = {
          title: analysis.title || title || '未命名',
          genre: analysis.genre,
          tone: analysis.tone,
          theme: analysis.theme,
          estimatedDurationSec: analysis.estimatedDurationSec || 120,
          characters: characters.map((c: any, i: number) => ({ id: `char_${i + 1}`, name: c.Name, description: c.description })),
        };

        send({
          type: 'done',
          draft: {
            status: 'ready',
            source: { language, title, storyText },
            storySummary,
            scenes,
            generationMeta: { model: config.model, version: '1.0', lastGeneratedAt: new Date().toISOString(), warnings: [] },
          },
        });

      } catch (e: any) {
        console.error('Generate error:', e);
        send({ error: e.message || '生成失败' });
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
