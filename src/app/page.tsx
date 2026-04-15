'use client';

import { useState } from 'react';
import type { StoryDraft, Scene, Shot } from '@/types/draft';

const MODEL_NAME = process.env.NEXT_PUBLIC_MODEL_NAME || 'GPT-4';

export default function Home() {
  const [storyText, setStoryText] = useState('');
  const [title, setTitle] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'kling' | 'runway' | 'sora'>('kling');

  const handleGenerate = async () => {
    if (!storyText.trim()) return;

    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyText,
          language: 'zh',
          title: title || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建失败');
      }

      const data = await res.json();
      setDraftId(data.id);
      setPolling(true);
      pollDraft(data.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pollDraft = async (id: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/drafts/${id}`);
        if (!res.ok) return;
        const data: StoryDraft = await res.json();
        setDraft(data);

        if (data.status === 'ready' || data.status === 'failed' || data.status === 'partial_failed') {
          setPolling(false);
          return;
        }
      } catch (e) {
        console.error('轮询失败', e);
      }

      if (polling) {
        setTimeout(poll, 2000);
      }
    };

    poll();
  };

  const handleClear = () => {
    setStoryText('');
    setTitle('');
    setDraft(null);
    setDraftId(null);
    setError(null);
    setExpandedShots(new Set());
  };

  const toggleShot = (shotId: string) => {
    const next = new Set(expandedShots);
    if (next.has(shotId)) {
      next.delete(shotId);
    } else {
      next.add(shotId);
    }
    setExpandedShots(next);
  };

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const statusConfig = {
    draft: { label: '草稿', bg: 'bg-gray-700', text: 'text-gray-300' },
    generating: { label: '生成中', bg: 'bg-blue-900', text: 'text-blue-300' },
    partial_failed: { label: '部分失败', bg: 'bg-yellow-900', text: 'text-yellow-300' },
    ready: { label: '就绪', bg: 'bg-green-900', text: 'text-green-300' },
    failed: { label: '失败', bg: 'bg-red-900', text: 'text-red-300' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800/50 backdrop-blur-sm bg-gray-950/80 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Story to Video
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">AI 分镜生成工作台</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">调用模型</span>
            <span className="px-3 py-1 bg-gray-800 rounded-full text-sm font-medium text-blue-400">
              {MODEL_NAME}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 故事输入区 */}
        <section className="mb-10">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              输入故事
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-2">标题（可选）</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="给故事起个标题"
                className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-400">故事文本 *</label>
                <span className={`text-xs ${storyText.length < 50 ? 'text-red-400' : 'text-gray-500'}`}>
                  {storyText.length} / 50000
                </span>
              </div>
              <textarea
                value={storyText}
                onChange={e => setStoryText(e.target.value)}
                placeholder="在这里粘贴你的短篇故事...\n\n系统会自动分析故事结构，拆分成场景和分镜，为每个镜头生成多个 AI 视频平台的生成 Prompt。"
                rows={10}
                className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-y font-mono text-sm leading-relaxed"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || !storyText.trim() || storyText.length < 50}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none shadow-lg shadow-blue-500/25"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    生成中...
                  </span>
                ) : '生成 Draft'}
              </button>
              <button
                onClick={handleClear}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-medium transition-all"
              >
                清空
              </button>
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-900/20 border border-red-800/50 rounded-xl text-red-300 text-sm">
                <span className="font-medium">错误：</span>{error}
              </div>
            )}
          </div>
        </section>

        {/* Draft 概览 */}
        {draft && (
          <section className="mb-10 animate-in fade-in duration-500">
            {/* 状态栏 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-white">Draft 概览</h2>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig[draft.status].bg} ${statusConfig[draft.status].text}`}>
                  {statusConfig[draft.status].label}
                </span>
                {polling && (
                  <span className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    更新中
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                生成时间：{new Date(draft.generationMeta.lastGeneratedAt).toLocaleString('zh-CN')}
              </div>
            </div>

            {/* 故事信息卡 */}
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-3">{draft.storySummary.title}</h3>
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-purple-900/30 border border-purple-800/50 rounded-lg text-sm text-purple-300">
                      {draft.storySummary.genre}
                    </span>
                    <span className="px-3 py-1 bg-blue-900/30 border border-blue-800/50 rounded-lg text-sm text-blue-300">
                      {draft.storySummary.tone}
                    </span>
                    <span className="px-3 py-1 bg-green-900/30 border border-green-800/50 rounded-lg text-sm text-green-300">
                      {draft.storySummary.theme}
                    </span>
                    <span className="px-3 py-1 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-300">
                      预估 {Math.round(draft.storySummary.estimatedDurationSec / 60)} 分钟
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">{draft.scenes.length}</div>
                  <div className="text-xs text-gray-500">场景</div>
                </div>
              </div>

              {/* 角色列表 */}
              {draft.storySummary.characters.length > 0 && (
                <div className="border-t border-gray-800 pt-5">
                  <h4 className="text-sm font-medium text-gray-400 mb-3">角色 ({draft.storySummary.characters.length})</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {draft.storySummary.characters.map((char, i) => (
                      <div key={char.id} className="bg-gray-950/50 rounded-xl p-4 border border-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {char.name[0]}
                          </div>
                          <div>
                            <div className="font-medium text-white">{char.name}</div>
                            <div className="text-xs text-gray-500">{char.id}</div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed">{char.description}</p>
                        {char.appearance && (
                          <p className="text-xs text-gray-500 mt-2 italic">外貌：{char.appearance}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 警告 */}
              {draft.generationMeta.warnings.length > 0 && (
                <div className="mt-5 p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-xl">
                  <div className="text-sm text-yellow-300 font-medium mb-2">⚠️ 生成警告</div>
                  <ul className="text-sm text-yellow-400/80 space-y-1">
                    {draft.generationMeta.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Scenes */}
            <div className="space-y-6">
              {draft.scenes.map((scene, sceneIdx) => (
                <div key={scene.id} className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl overflow-hidden">
                  {/* Scene Header */}
                  <div className="px-6 py-5 border-b border-gray-800 bg-gradient-to-r from-gray-900/80 to-transparent">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 bg-blue-600/20 border border-blue-600/30 rounded-xl">
                          <span className="text-blue-400 font-bold">{scene.sequence}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-white">Scene {scene.sequence}</h3>
                            <span className="text-gray-500">·</span>
                            <span className="text-gray-300">{scene.location}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              scene.timeOfDay === 'day' ? 'bg-yellow-900/30 text-yellow-400' :
                              scene.timeOfDay === 'night' ? 'bg-indigo-900/30 text-indigo-400' :
                              scene.timeOfDay === 'dusk' ? 'bg-orange-900/30 text-orange-400' :
                              'bg-gray-800 text-gray-400'
                            }`}>
                              {scene.timeOfDay === 'day' ? '☀️ 白天' : scene.timeOfDay === 'night' ? '🌙 夜晚' : scene.timeOfDay === 'dusk' ? '🌅 黄昏' : '❓ 未知'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {scene.shots.length} 个镜头 · 约{scene.shots.reduce((a, s) => a + s.durationSec, 0)}秒
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 mt-3 leading-relaxed">{scene.summary}</p>
                  </div>

                  {/* Shots */}
                  <div className="divide-y divide-gray-800/50">
                    {scene.shots.map((shot) => (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        sceneIdx={sceneIdx}
                        expanded={expandedShots.has(shot.id)}
                        onToggle={() => toggleShot(shot.id)}
                        onCopy={copyPrompt}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// Shot Card Component
function ShotCard({
  shot,
  sceneIdx,
  expanded,
  onToggle,
  onCopy,
}: {
  shot: Shot;
  sceneIdx: number;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'kling' | 'runway' | 'sora'>('kling');

  const purposeLabels: Record<string, string> = {
    establishing: '建立',
    action: '动作',
    reaction: '反应',
    transition: '转场',
    closeup: '特写',
  };

  const emotionColors: Record<string, string> = {
    '平静': 'text-gray-400',
    '紧张': 'text-red-400',
    '悬疑': 'text-purple-400',
    '欢快': 'text-green-400',
    '悲伤': 'text-blue-400',
    '愤怒': 'text-red-500',
    '温情': 'text-pink-400',
    '浪漫': 'text-rose-400',
    '戏剧性': 'text-yellow-400',
  };

  return (
    <div className="px-6 py-4 hover:bg-gray-800/30 transition-colors">
      {/* Shot Header */}
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-8 h-8 bg-gray-800 border border-gray-700 rounded-lg">
            <span className="text-gray-400 text-sm font-medium">{shot.sequence}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">{shot.shotType}</span>
            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">{shot.cameraAngle}</span>
            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">{shot.cameraMovement}</span>
            <span className={`text-xs font-medium ${emotionColors[shot.emotion] || 'text-gray-400'}`}>
              {shot.emotion}
            </span>
            <span className="text-xs text-gray-500">{shot.durationSec}秒</span>
            <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-800/50 rounded text-xs text-blue-400">
              {purposeLabels[shot.purpose] || shot.purpose}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {shot.subjects.map(id => id.replace('char_', 'C')).join(', ')}
          </span>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Shot Details */}
      {expanded && (
        <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Visual Description */}
          <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800">
            <div className="text-xs font-medium text-gray-500 mb-2">画面描述</div>
            <p className="text-sm text-gray-300 leading-relaxed">{shot.visualDescription}</p>
          </div>

          {/* Dialogue */}
          {shot.dialogue && (
            <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800 border-l-2 border-l-blue-600">
              <div className="text-xs font-medium text-gray-500 mb-2">对白</div>
              <p className="text-sm text-gray-300 italic">&ldquo;{shot.dialogue}&rdquo;</p>
            </div>
          )}

          {/* Continuity Notes */}
          {shot.continuityNotes && (
            <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800 border-l-2 border-l-yellow-600">
              <div className="text-xs font-medium text-gray-500 mb-2">连续性说明</div>
              <p className="text-sm text-gray-400">{shot.continuityNotes}</p>
            </div>
          )}

          {/* Sound Cue */}
          {shot.soundCue && (
            <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800 border-l-2 border-l-green-600">
              <div className="text-xs font-medium text-gray-500 mb-2">音效提示</div>
              <p className="text-sm text-gray-400">{shot.soundCue}</p>
            </div>
          )}

          {/* Platform Prompts */}
          <div className="bg-gray-950/50 rounded-xl overflow-hidden border border-gray-800">
            <div className="flex border-b border-gray-800">
              {(['kling', 'runway', 'sora'] as const).map(platform => (
                <button
                  key={platform}
                  onClick={() => setActiveTab(platform)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === platform
                      ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  {platform.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  shot.platformPrompts[activeTab].status === 'ready' ? 'bg-green-900/30 text-green-400' :
                  shot.platformPrompts[activeTab].status === 'stale' ? 'bg-yellow-900/30 text-yellow-400' :
                  'bg-red-900/30 text-red-400'
                }`}>
                  {shot.platformPrompts[activeTab].status === 'ready' ? '就绪' :
                   shot.platformPrompts[activeTab].status === 'stale' ? '已过期' : '失败'}
                </span>
                <button
                  onClick={() => onCopy(shot.platformPrompts[activeTab].text)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors"
                >
                  复制 Prompt
                </button>
              </div>
              <p className="text-sm text-gray-300 font-mono leading-relaxed bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                {shot.platformPrompts[activeTab].text}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
