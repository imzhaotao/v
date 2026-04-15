import type { StorySummary, Character, Scene, Source } from '@/types/draft';

const ANALYSIS_PROMPT = `你是一个专业的电影分镜师和剧本分析师。

请分析以下故事文本，输出一个结构化的故事分析结果。

分析要求：
1. 提取故事的核心元素：标题、类型、风格、主题
2. 识别所有角色并给出描述
3. 将故事划分为合理的场景（Scene），每个场景包含时间地点信息
4. 估算整个故事的视听时长（秒）

注意：
- 场景划分要基于地点和时间的自然转换
- 角色描述要包含外貌和性格特征
- 时长估算基于平均每分钟 150-200 字的故事朗读速度

输出格式（严格 JSON）：
{
  "title": "故事标题",
  "genre": "故事类型（如：悬疑、爱情、科幻、喜剧等）",
  "tone": "整体风格（如：紧张、温馨、荒诞、现实主义等）",
  "theme": "核心主题（如：救赎、成长、爱情、复仇等）",
  "estimatedDurationSec": 总时长秒数,
  "characters": [
    {
      "id": "char_1",
      "name": "角色名",
      "description": "角色描述，包含性格和在故事中的作用",
      "appearance": "外貌特征（可选）",
      "voiceStyle": "说话风格（可选）"
    }
  ],
  "scenes": [
    {
      "sequence": 1,
      "location": "场景地点",
      "timeOfDay": "day|night|dusk|unknown",
      "summary": "这个场景发生的事件概述"
    }
  ]
}

故事文本：
---

{storyText}

---

请严格输出 JSON，不要包含任何其他文字。`;

export interface AnalysisResult {
  title: string;
  genre: string;
  tone: string;
  theme: string;
  estimatedDurationSec: number;
  characters: Omit<Character, 'id'>[];
  scenes: Omit<Scene, 'shots' | 'id'>[];
}

export async function analyzeStory(
  storyText: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<AnalysisResult> {
  const prompt = ANALYSIS_PROMPT.replace('{storyText}', storyText);
  const response = await llmCall(prompt);
  
  // 解析 JSON
  let data: AnalysisResult;
  try {
    // 尝试提取 JSON（可能包含在 markdown 代码块中）
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || response.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    data = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`故事分析失败：无法解析 LLM 返回的 JSON。原始内容：${response.slice(0, 500)}`);
  }

  // 验证必填字段
  if (!data.title || !data.genre || !Array.isArray(data.characters) || !Array.isArray(data.scenes)) {
    throw new Error(`故事分析失败：LLM 返回的数据结构不完整。`);
  }

  // 补充 ID
  data.characters = data.characters.map((char, i) => ({
    ...char,
    id: `char_${i + 1}`,
  }));

  return data;
}
