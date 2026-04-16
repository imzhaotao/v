// ================================
// StoryDraft 核心类型定义
// ================================

export type DraftStatus = 'draft' | 'generating' | 'partial_failed' | 'ready' | 'failed';

export type TimeOfDay = 'day' | 'night' | 'dusk' | 'unknown';

export type ShotPurpose = 'establishing' | 'action' | 'reaction' | 'transition' | 'closeup';

export type ShotType = '远景' | '全景' | '中景' | '近景' | '特写' | '大特写';
export type CameraAngle = '平视' | '仰视' | '俯视' | '倾斜' | '鸟瞰';
export type CameraMovement = '固定' | '推' | '拉' | '摇' | '移' | '跟' | '升降' | '综合';
export type Emotion = '平静' | '紧张' | '悬疑' | '欢快' | '悲伤' | '愤怒' | '温情' | '浪漫' | '戏剧性';

export type Platform = 'kling' | 'runway' | 'sora';
export type PromptStatus = 'ready' | 'stale' | 'failed';

// ================================
// Source
// ================================
export interface Source {
  language: 'zh' | 'en' | 'mixed';
  title?: string;
  storyText: string;
}

// ================================
// Character
// ================================
export interface Character {
  id: string;
  name: string;
  description: string;
  appearance?: string;
  voiceStyle?: string;
  imageUrl?: string;
}

// ================================
// Story Summary
// ================================
export interface StorySummary {
  title: string;
  genre: string;
  tone: string;
  theme: string;
  estimatedDurationSec: number;
  characters: Character[];
}

// ================================
// Platform Prompt
// ================================
export interface PlatformPrompt {
  text: string;
  status: PromptStatus;
}

// ================================
// Shot Meta
// ================================
export interface ShotMeta {
  aiGenerated: boolean;
  userEditedFields: string[];
}

// ================================
// Shot
// ================================
export interface Shot {
  id: string;
  sequence: number;
  purpose: ShotPurpose;
  durationSec: number;
  shotType: ShotType;
  cameraAngle: CameraAngle;
  cameraMovement: CameraMovement;
  subjects: string[]; // character ids
  visualDescription: string;
  dialogue?: string;
  emotion: Emotion;
  soundCue?: string;
  continuityNotes?: string;
  platformPrompts: {
    kling: PlatformPrompt;
    runway: PlatformPrompt;
    sora: PlatformPrompt;
  };
  meta: ShotMeta;
}

// ================================
// Scene
// ================================
export interface Scene {
  id: string;
  sequence: number;
  location: string;
  timeOfDay: TimeOfDay;
  summary: string;
  shots: Shot[];
}

// ================================
// Generation Meta
// ================================
export interface GenerationMeta {
  model: string;
  version: string;
  lastGeneratedAt: string;
  warnings: string[];
}

// ================================
// StoryDraft
// ================================
export interface StoryDraft {
  id: string;
  status: DraftStatus;
  source: Source;
  storySummary: StorySummary;
  scenes: Scene[];
  generationMeta: GenerationMeta;
}

// ================================
// API 请求/响应类型
// ================================

export interface CreateDraftRequest {
  storyText: string;
  language?: 'zh' | 'en' | 'mixed';
  title?: string;
}

export interface CreateDraftResponse {
  id: string;
  status: DraftStatus;
}

export interface UpdateDraftRequest {
  // 允许部分更新的字段
  storySummary?: Partial<StorySummary>;
  scenes?: Scene[];
}

export interface RegenerateSceneRequest {
  sceneId: string;
}

export interface RegenerateShotRequest {
  shotId: string;
}

export interface RegeneratePromptRequest {
  platform: Platform;
}

export interface ExportFormat {
  format: 'json' | 'markdown' | 'csv';
}
