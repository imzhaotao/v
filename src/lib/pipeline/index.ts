import type { StoryDraft, StorySummary, Scene, Shot, Source, GenerationMeta } from '@/types/draft';
import { analyzeStory, type AnalysisResult } from './story-analysis';
import { expandSceneToShots, type ShotData } from './shot-expansion';
import { renderPlatformPrompts } from './platform-render';
import { v4 as uuidv4 } from 'uuid';

// ================================
// 简单内存存储（第一阶段用）
// 后续替换为 PostgreSQL
// ================================
const draftStore = new Map<string, StoryDraft>();

export function getDraft(id: string): StoryDraft | undefined {
  return draftStore.get(id);
}

export function saveDraft(draft: StoryDraft): void {
  draftStore.set(draft.id, draft);
}

export function updateDraft(id: string, updates: Partial<StoryDraft>): StoryDraft | undefined {
  const draft = draftStore.get(id);
  if (!draft) return undefined;
  const updated = { ...draft, ...updates };
  draftStore.set(id, updated);
  return updated;
}

// ================================
// 流水线
// ================================

export interface PipelineContext {
  draftId: string;
  storyText: string;
  language: 'zh' | 'en' | 'mixed';
  title?: string;
  llmCall: (prompt: string) => Promise<string>;
}

export interface PipelineResult {
  draft: StoryDraft;
  errors: string[];
}

export async function runGenerationPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const { draftId, storyText, language, title, llmCall } = ctx;
  const errors: string[] = [];

  // 创建 Draft 骨架
  const source: Source = {
    language,
    title,
    storyText,
  };

  const generationMeta: GenerationMeta = {
    model: 'gpt-4',
    version: '1.0',
    lastGeneratedAt: new Date().toISOString(),
    warnings: [],
  };

  const draft: StoryDraft = {
    id: draftId,
    status: 'generating',
    source,
    storySummary: {
      title: title || '未命名',
      genre: '',
      tone: '',
      theme: '',
      estimatedDurationSec: 0,
      characters: [],
    },
    scenes: [],
    generationMeta,
  };

  saveDraft(draft);

  try {
    // Step 1: 故事分析
    const analysis = await analyzeStory(storyText, llmCall);

    // 构建 storySummary
    const storySummary: StorySummary = {
      title: analysis.title || title || '未命名',
      genre: analysis.genre,
      tone: analysis.tone,
      theme: analysis.theme,
      estimatedDurationSec: analysis.estimatedDurationSec,
      characters: analysis.characters as StoryDraft['storySummary']['characters'],
    };

    // Step 2: 对每个 Scene 进行分镜扩展
    const scenes: Scene[] = [];
    const charactersWithIds = analysis.characters.map((c, i) => ({ ...c, id: `char_${i + 1}` }));

    for (const sceneData of analysis.scenes) {
      try {
        const shotsData: ShotData[] = await expandSceneToShots(sceneData, charactersWithIds, llmCall);

        // Step 3: 为每个 Shot 生成多平台 Prompt
        const shots: Shot[] = shotsData.map((shotData, i) => {
          const prompts = renderPlatformPromptsSync(shotData, charactersWithIds);
          return {
            id: `shot_${sceneData.sequence}_${i + 1}`,
            sequence: shotData.sequence,
            purpose: shotData.purpose,
            durationSec: shotData.durationSec,
            shotType: shotData.shotType,
            cameraAngle: shotData.cameraAngle,
            cameraMovement: shotData.cameraMovement,
            subjects: shotData.subjects,
            visualDescription: shotData.visualDescription,
            dialogue: shotData.dialogue,
            emotion: shotData.emotion,
            soundCue: shotData.soundCue,
            continuityNotes: shotData.continuityNotes,
            platformPrompts: {
              kling: { text: prompts.kling, status: 'ready' },
              runway: { text: prompts.runway, status: 'ready' },
              sora: { text: prompts.sora, status: 'ready' },
            },
            meta: {
              aiGenerated: true,
              userEditedFields: [],
            },
          };
        });

        scenes.push({
          id: `scene_${sceneData.sequence}`,
          sequence: sceneData.sequence,
          location: sceneData.location,
          timeOfDay: sceneData.timeOfDay,
          summary: sceneData.summary,
          shots,
        });
      } catch (e: any) {
        errors.push(`场景 ${sceneData.sequence} 处理失败：${e.message}`);
      }
    }

    // 更新 Draft
    const finalDraft: StoryDraft = {
      ...draft,
      status: errors.length === 0 ? 'ready' : errors.length < analysis.scenes.length ? 'partial_failed' : 'failed',
      storySummary,
      scenes,
      generationMeta: {
        ...generationMeta,
        lastGeneratedAt: new Date().toISOString(),
        warnings: errors,
      },
    };

    saveDraft(finalDraft);
    return { draft: finalDraft, errors };

  } catch (e: any) {
    const failedDraft: StoryDraft = {
      ...draft,
      status: 'failed',
      generationMeta: {
        ...generationMeta,
        lastGeneratedAt: new Date().toISOString(),
        warnings: [e.message],
      },
    };
    saveDraft(failedDraft);
    return { draft: failedDraft, errors: [e.message] };
  }
}

// 同步版本的 prompt 渲染（不调用 LLM 优化）
function renderPlatformPromptsSync(
  shotData: ShotData,
  characters: { id: string; name: string }[]
): { kling: string; runway: string; sora: string } {
  const subjectsDescription = (shotData.subjects || [])
    .map(id => characters.find(c => c.id === id)?.name || id)
    .join(' and ') || 'main subject';

  const buildPrompt = (prefix: string) =>
    `${prefix}, ${shotData.shotType}, ${shotData.cameraAngle}, ${shotData.cameraMovement} shot, ${subjectsDescription}, ${shotData.visualDescription}, ${shotData.emotion} mood`.trim();

  return {
    kling: buildPrompt('Cinematic video'),
    runway: buildPrompt('Film still'),
    sora: buildPrompt('Cinematic scene'),
  };
}

// 生成唯一 ID
export function generateDraftId(): string {
  return `draft_${Date.now()}_${uuidv4().slice(0, 8)}`;
}
