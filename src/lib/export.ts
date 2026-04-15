import type { StoryDraft } from '@/types/draft';

export function exportAsJson(draft: StoryDraft): string {
  return JSON.stringify(draft, null, 2);
}

export function exportAsMarkdown(draft: StoryDraft): string {
  const lines: string[] = [];

  lines.push(`# ${draft.storySummary.title}`);
  lines.push('');
  lines.push(`**类型：** ${draft.storySummary.genre}  |  **风格：** ${draft.storySummary.tone}  |  **主题：** ${draft.storySummary.theme}`);
  lines.push(`**预估时长：** ${Math.round(draft.storySummary.estimatedDurationSec / 60)} 分钟`);
  lines.push('');

  if (draft.storySummary.characters.length > 0) {
    lines.push('## 角色');
    lines.push('');
    for (const char of draft.storySummary.characters) {
      lines.push(`- **${char.name}**：${char.description}`);
    }
    lines.push('');
  }

  lines.push('## 分镜');
  lines.push('');

  for (const scene of draft.scenes) {
    lines.push(`### Scene ${scene.sequence}：${scene.location}（${scene.timeOfDay === 'day' ? '白天' : scene.timeOfDay === 'night' ? '夜晚' : scene.timeOfDay === 'dusk' ? '黄昏' : '未知'}）`);
    lines.push('');
    lines.push(`> ${scene.summary}`);
    lines.push('');

    for (const shot of scene.shots) {
      lines.push(`#### Shot ${shot.sequence} | ${shot.shotType} | ${shot.cameraAngle} | ${shot.cameraMovement} | ${shot.durationSec}秒 | ${shot.emotion}`);
      lines.push('');
      lines.push(`${shot.visualDescription}`);
      if (shot.dialogue) {
        lines.push('');
        lines.push(`**对白：** "${shot.dialogue}"`);
      }
      lines.push('');
      lines.push('| 平台 | Prompt |');
      lines.push('|------|--------|');
      lines.push(`| **Kling** | \`${shot.platformPrompts.kling.text}\` |`);
      lines.push(`| **Runway** | \`${shot.platformPrompts.runway.text}\` |`);
      lines.push(`| **Sora** | \`${shot.platformPrompts.sora.text}\` |`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(`*由 Story to Video 生成 | ${new Date().toLocaleString('zh-CN')}*`);

  return lines.join('\n');
}

export function exportAsCsv(draft: StoryDraft): string {
  const rows: string[] = [];

  // Header
  rows.push('Scene,Shot,景别,角度,运镜,时长(秒),情绪,目的,画面描述,对白,Kling Prompt,Runway Prompt,Sora Prompt');

  for (const scene of draft.scenes) {
    for (const shot of scene.shots) {
      const row = [
        scene.sequence,
        shot.sequence,
        shot.shotType,
        shot.cameraAngle,
        shot.cameraMovement,
        shot.durationSec,
        shot.emotion,
        shot.purpose,
        `"${(shot.visualDescription || '').replace(/"/g, '""')}"`,
        `"${(shot.dialogue || '').replace(/"/g, '""')}"`,
        `"${shot.platformPrompts.kling.text.replace(/"/g, '""')}"`,
        `"${shot.platformPrompts.runway.text.replace(/"/g, '""')}"`,
        `"${shot.platformPrompts.sora.text.replace(/"/g, '""')}"`,
      ];
      rows.push(row.join(','));
    }
  }

  return rows.join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
