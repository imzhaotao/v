import type { Shot, Platform } from '@/types/draft';
import type { ShotData } from './shot-expansion';

// ================================
// 平台 Prompt 模板
// ================================

const KLING_TEMPLATE = ` cinematography, {shotType}, {cameraAngle}, {cameraMovement} shot, {subjectsDescription}, {visualDescription}, {emotion} mood, {continuityNotes}`.trim();

const RUNWAY_TEMPLATE = `Film still, {shotType}, {cameraAngle} angle, {cameraMovement} movement, {subjectsDescription}, {visualDescription}, {emotion} atmosphere, cinematic lighting, {continuityNotes}`.trim();

const SORA_TEMPLATE = `Cinematic scene, {shotType}, {cameraAngle} view, {cameraMovement} camera motion, {subjectsDescription}, {visualDescription}, {emotion} tone, professional cinematography, {continuityNotes}`.trim();

function renderTemplate(template: string, shot: ShotData, subjectsDescription: string): string {
  return template
    .replace('{shotType}', shot.shotType)
    .replace('{cameraAngle}', shot.cameraAngle)
    .replace('{cameraMovement}', shot.cameraMovement)
    .replace('{subjectsDescription}', subjectsDescription || 'main subject')
    .replace('{visualDescription}', shot.visualDescription)
    .replace('{emotion}', shot.emotion)
    .replace('{continuityNotes}', shot.continuityNotes || 'cinematic quality');
}

export interface PlatformPromptResult {
  kling: string;
  runway: string;
  sora: string;
}

export async function renderPlatformPrompts(
  shot: ShotData,
  characters: { id: string; name: string }[],
  llmCall?: (prompt: string) => Promise<string>
): Promise<PlatformPromptResult> {
  // 构建角色描述
  const subjectIds = shot.subjects || [];
  const subjectsDescription = subjectIds
    .map(id => {
      const char = characters.find(c => c.id === id);
      return char ? char.name : id;
    })
    .join(' and ');

  // 如果有 LLM 调用能力，可以让 LLM 优化 prompt
  if (llmCall) {
    const optimizationPrompt = `你是一个 AI 视频生成 Prompt 优化专家。

原始分镜信息：
- 景别：${shot.shotType}
- 角度：${shot.cameraAngle}
- 运镜：${shot.cameraMovement}
- 画面描述：${shot.visualDescription}
- 情绪：${shot.emotion}
- 角色：${subjectsDescription}

请为以下三个平台生成优化的英文 Prompt：

Kling 平台（中文 AI 视频平台，强调运镜和画面质量）：
Runway 平台（欧美 AI 视频平台，电影感强）：
Sora 平台（OpenAI 视频生成）：

输出格式（严格 JSON）：
{
  "kling": "kling prompt 英文",
  "runway": "runway prompt 英文",
  "sora": "sora prompt 英文"
}

请严格输出 JSON。`;

    try {
      const response = await llmCall(optimizationPrompt);
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || response.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      return JSON.parse(jsonStr);
    } catch (e) {
      // LLM 优化失败，使用模板
    }
  }

  // 使用模板生成
  return {
    kling: renderTemplate(KLING_TEMPLATE, shot, subjectsDescription),
    runway: renderTemplate(RUNWAY_TEMPLATE, shot, subjectsDescription),
    sora: renderTemplate(SORA_TEMPLATE, shot, subjectsDescription),
  };
}

// 单个平台渲染（用于局部重生成）
export async function renderSinglePlatformPrompt(
  platform: Platform,
  shot: ShotData,
  characters: { id: string; name: string }[],
  llmCall: (prompt: string) => Promise<string>
): Promise<string> {
  const allPrompts = await renderPlatformPrompts(shot, characters, llmCall);
  return allPrompts[platform];
}
