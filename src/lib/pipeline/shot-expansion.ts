import type { Scene, Shot, ShotType, CameraAngle, CameraMovement, Emotion, ShotPurpose, Character } from '@/types/draft';

const SHOT_EXPANSION_PROMPT = `你是一个专业的电影分镜师。

根据以下场景信息，为这个场景设计分镜（shots）。

场景信息：
- 场景序号：{sequence}
- 场景地点：{location}
- 时间：{timeOfDay}
- 场景描述：{summary}
- 故事中的角色：{characters}

分镜设计要求：
1. 每个镜头时长控制在 2-8 秒之间
2. 镜头类型要多样化：远景、全景、中景、近景、特写交替使用
3. 运镜方式要合理：建立镜头用固定或缓慢推拉，动作镜头可用跟拍或手持感
4. 每个镜头需要有明确的画面描述，能让 AI 视频生成工具直接使用
5. 注意镜头之间的连续性

镜头类型可选：远景、全景、中景、近景、特写、大特写
镜头角度可选：平视、仰视、俯视、倾斜、鸟瞰
运镜方式可选：固定、推、拉、摇、移、跟、升降、综合
镜头目的可选：establishing（建立）、action（动作）、reaction（反应）、transition（转场）、closeup（特写）
情绪可选：平静、紧张、悬疑、欢快、悲伤、愤怒、温情、浪漫、戏剧性

输出格式（严格 JSON 数组）：
[
  {
    "sequence": 1,
    "purpose": "establishing|action|reaction|transition|closeup",
    "durationSec": 3-8之间的数字,
    "shotType": "远景|全景|中景|近景|特写|大特写",
    "cameraAngle": "平视|仰视|俯视|倾斜|鸟瞰",
    "cameraMovement": "固定|推|拉|摇|移|跟|升降|综合",
    "subjects": ["char_1", "char_2"],
    "visualDescription": "详细的画面描述，要包含环境、人物位置、表情动作等细节",
    "dialogue": "对白（可选，如果没有则省略）",
    "emotion": "平静|紧张|悬疑|欢快|悲伤|愤怒|温情|浪漫|戏剧性",
    "soundCue": "音效提示（可选）",
    "continuityNotes": "连续性说明（可选）"
  }
]

请严格输出 JSON 数组，不要包含任何其他文字。`;

export interface ShotData {
  sequence: number;
  purpose: ShotPurpose;
  durationSec: number;
  shotType: ShotType;
  cameraAngle: CameraAngle;
  cameraMovement: CameraMovement;
  subjects: string[];
  visualDescription: string;
  dialogue?: string;
  emotion: Emotion;
  soundCue?: string;
  continuityNotes?: string;
}

export async function expandSceneToShots(
  scene: Omit<Scene, 'shots' | 'id'>,
  characters: Character[],
  llmCall: (prompt: string) => Promise<string>
): Promise<ShotData[]> {
  const charDescriptions = characters
    .map(c => `${c.id}: ${c.name} - ${c.description}`)
    .join('\n');

  const prompt = SHOT_EXPANSION_PROMPT
    .replace('{sequence}', String(scene.sequence))
    .replace('{location}', scene.location)
    .replace('{timeOfDay}', scene.timeOfDay)
    .replace('{summary}', scene.summary)
    .replace('{characters}', charDescriptions || '无特定角色');

  const response = await llmCall(prompt);

  let shots: ShotData[];
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || response.match(/(\[[\s\S]*\])/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    shots = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`场景 ${scene.sequence} 分镜扩展失败：无法解析 LLM 返回的 JSON。原始内容：${response.slice(0, 500)}`);
  }

  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error(`场景 ${scene.sequence} 分镜扩展失败：返回的分镜数据为空或格式错误。`);
  }

  return shots;
}
