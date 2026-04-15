'use client';

import { useState, useEffect } from 'react';
import type { StoryDraft, Shot, Scene } from '@/types/draft';
import { exportAsJson, exportAsMarkdown, exportAsCsv, downloadFile } from '@/lib/export';

const STORAGE_KEY = 'story_to_video_draft';

const AVAILABLE_MODELS = (process.env.NEXT_PUBLIC_AVAILABLE_MODELS || 'deepseek,minimax').split(',').map(m => m.trim());
const MODEL_LABELS: Record<string, string> = { deepseek: 'DeepSeek V3', minimax: 'MiniMax M2.7' };

type ProgressStep = 'idle' | 'analyzing' | 'expanding' | 'done' | 'error';

export default function Home() {
  const [storyText, setStoryText] = useState('');
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<string>('deepseek');
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressStep>('idle');
  const [progressText, setProgressText] = useState('');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [totalScenes, setTotalScenes] = useState(0);
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set());
  const [savedDraft, setSavedDraft] = useState<StoryDraft | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJson, setRestoreJson] = useState('');
  const [draftList, setDraftList] = useState<Array<{id: string; title: string; status: string; created_at: string}>>([]);

  // 页面加载时检查本地存储 + 加载列表
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSavedDraft(JSON.parse(saved));
      } catch {}
    }
    // 加载历史列表
    fetch('/api/drafts')
      .then(r => r.json())
      .then(data => {
        if (data.drafts) setDraftList(data.drafts);
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!storyText.trim()) return;

    setLoading(true);
    setError(null);
    setDraft(null);
    setProgress('analyzing');
    setProgressText('正在分析故事结构...');
    setSceneIndex(0);
    setTotalScenes(0);

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyText, language: 'zh', title: title || undefined, model }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建失败');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'start') {
              setProgressText('开始分析故事...');
            } else if (data.type === 'analysis') {
              setProgress('expanding');
              setProgressText('正在展开分镜...');
              setTotalScenes(data.data.scenes?.length || 0);
              // 创建预览 Draft
              setDraft({
                id: data.draftId || '',
                status: 'generating',
                source: { language: 'zh', title: title || data.data.title, storyText },
                storySummary: {
                  title: data.data.title || title || '未命名',
                  genre: data.data.genre || '',
                  tone: data.data.tone || '',
                  theme: data.data.theme || '',
                  estimatedDurationSec: data.data.estimatedDurationSec || 120,
                  characters: (data.data.characters || []).map((c: any, i: number) => ({
                    id: `char_${i + 1}`,
                    name: c.name || '',
                    description: c.description || '',
                  })),
                },
                scenes: (data.data.scenes || []).map((s: any, i: number) => ({
                  id: `scene_${i + 1}`,
                  sequence: i + 1,
                  location: s.location || '未知',
                  timeOfDay: s.timeOfDay || 'unknown',
                  summary: s.summary || '',
                  shots: [],
                })),
                generationMeta: {
                  model: model,
                  version: '1.0',
                  lastGeneratedAt: new Date().toISOString(),
                  warnings: [],
                },
              });
            } else if (data.type === 'scene_progress') {
              setSceneIndex(data.sceneIndex + 1);
              setTotalScenes(data.totalScenes);
              setDraft((prev: any) => {
                if (!prev) return prev;
                return { ...prev };
              });
            } else if (data.type === 'done') {
              setDraft(data.draft);
              setProgress('done');
              setProgressText('生成完成');
            } else if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
      setProgress('error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setStoryText('');
    setTitle('');
    setDraft(null);
    setError(null);
    setProgress('idle');
    setProgressText('');
    setExpandedShots(new Set());
  };

  const handleSave = () => {
    if (!draft) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setSavedDraft(draft);
  };

  const handleRestore = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as StoryDraft;
      setDraft(parsed);
      setShowRestoreModal(false);
    } catch (e) {
      setError('恢复失败，数据格式错误');
    }
  };

  const handleRestoreFromJson = () => {
    if (!restoreJson.trim()) return;
    try {
      const parsed = JSON.parse(restoreJson) as StoryDraft;
      setDraft(parsed);
      setShowRestoreModal(false);
      setRestoreJson('');
    } catch (e) {
      setError('JSON 格式错误');
    }
  };

  const handleDeleteSaved = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSavedDraft(null);
  };

  const toggleShot = (shotId: string) => {
    const next = new Set(expandedShots);
    if (next.has(shotId)) next.delete(shotId);
    else next.add(shotId);
    setExpandedShots(next);
  };

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800/50 backdrop-blur-sm bg-gray-950/80 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Story to Video
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">AI 分镜生成工作台</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 历史记录列表 */}
        {draftList.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-white mb-4">历史记录</h2>
            <div className="space-y-2">
              {draftList.map(d => (
                <button
                  key={d.id}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/drafts/${d.id}`);
                      const data = await res.json();
                      if (!data.error) {
                        setDraft(data);
                        setStoryText('');
                        setTitle('');
                      }
                    } catch {}
                  }}
                  className="w-full text-left bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-white truncate">{d.title || '未命名'}</div>
                    <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'ready' ? 'bg-green-900/30 text-green-400' : d.status === 'failed' ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'}`}>
                      {d.status === 'ready' ? '就绪' : d.status === 'failed' ? '失败' : '生成中'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {d.created_at ? new Date(d.created_at).toLocaleString('zh-CN') : ''}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 输入区 */}
        <section className="mb-10">
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              输入故事
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-400 mb-2">标题（可选）</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="给故事起个标题"
                className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-400">故事文本 *</label>
                <span className={`text-xs ${storyText.length < 20 ? 'text-red-400' : 'text-gray-500'}`}>
                  {storyText.length.toLocaleString()} / 100,000
                </span>
              </div>
              <textarea
                value={storyText}
                onChange={e => setStoryText(e.target.value)}
                placeholder="粘贴你的短篇故事...（至少 20 字）"
                rows={10}
                className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y font-mono text-sm leading-relaxed"
              />
              {storyText.length > 0 && storyText.length < 20 && (
                <p className="text-xs text-orange-400 mt-2">故事文本至少需要 20 个字符才能生成（还需 {20 - storyText.length} 字）</p>
              )}
            </div>

            {/* 进度指示 */}
            {loading && (
              <div className="mb-4 p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <svg className="animate-spin h-5 w-5 text-blue-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-blue-300 font-medium">{progressText}</span>
                </div>
                {totalScenes > 0 && (
                  <div className="text-sm text-gray-400">
                    场景进度：{sceneIndex} / {totalScenes}
                  </div>
                )}
                <div className="mt-2 w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: progress === 'expanding' && totalScenes > 0 ? `${(sceneIndex / totalScenes) * 100}%` : '30%' }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {AVAILABLE_MODELS.map(m => (
                  <option key={m} value={m}>{MODEL_LABELS[m] || m}</option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={loading || !storyText.trim() || storyText.length < 20}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/25"
              >
                {loading ? '生成中...' : '生成 Draft'}
              </button>
              <button onClick={handleClear} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-medium transition-all">
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

        {/* Draft 结果 */}
        {draft && (
          <DraftView
            draft={draft}
            expandedShots={expandedShots}
            onToggleShot={toggleShot}
            onCopy={copyPrompt}
            onSave={handleSave}
            onShowRestore={() => { setRestoreJson(''); setShowRestoreModal(true); }}
          />
        )}

        {/* 恢复弹窗 */}
        {showRestoreModal && (
          <RestoreModal
            savedDraft={savedDraft}
            onClose={() => setShowRestoreModal(false)}
            onRestore={handleRestore}
            onRestoreJson={handleRestoreFromJson}
            onDelete={handleDeleteSaved}
            restoreJson={restoreJson}
            setRestoreJson={setRestoreJson}
          />
        )}
      </main>
    </div>
  );
}

function DraftView({ draft, expandedShots, onToggleShot, onCopy, onSave, onShowRestore }: {
  draft: StoryDraft;
  expandedShots: Set<string>;
  onToggleShot: (id: string) => void;
  onCopy: (text: string) => void;
  onSave: () => void;
  onShowRestore: () => void;
}) {
  const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
    generating: { label: '生成中', bg: 'bg-blue-900', text: 'text-blue-300' },
    ready: { label: '就绪', bg: 'bg-green-900', text: 'text-green-300' },
    partial_failed: { label: '部分失败', bg: 'bg-yellow-900', text: 'text-yellow-300' },
    failed: { label: '失败', bg: 'bg-red-900', text: 'text-red-300' },
  };

  return (
    <section className="mb-10">
      {/* 状态栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">Draft 概览</h2>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig[draft.status]?.bg || 'bg-gray-800'} ${statusConfig[draft.status]?.text || 'text-gray-400'}`}>
            {statusConfig[draft.status]?.label || draft.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {draft.generationMeta.lastGeneratedAt && `生成时间：${new Date(draft.generationMeta.lastGeneratedAt).toLocaleString('zh-CN')}`}
          </span>
          <div className="flex items-center gap-2 border-l border-gray-700 pl-3">
            <button
              onClick={onSave}
              className="px-3 py-1.5 text-xs bg-green-900/30 hover:bg-green-900/50 border border-green-800/50 text-green-400 rounded-lg transition-colors"
            >
              保存
            </button>
            <button
              onClick={onShowRestore}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
            >
              恢复
            </button>
            <button
              onClick={() => downloadFile(exportAsJson(draft), `${draft.storySummary.title || 'draft'}.json`, 'application/json')}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
            >
              JSON
            </button>
            <button
              onClick={() => downloadFile(exportAsMarkdown(draft), `${draft.storySummary.title || 'draft'}.md`, 'text/markdown')}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
            >
              Markdown
            </button>
            <button
              onClick={() => downloadFile(exportAsCsv(draft), `${draft.storySummary.title || 'draft'}.csv`, 'text/csv')}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* 故事信息 */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 mb-6">
        <h3 className="text-2xl font-bold text-white mb-3">{draft.storySummary.title}</h3>
        <div className="flex flex-wrap gap-3 mb-4">
          {draft.storySummary.genre && <span className="px-3 py-1 bg-purple-900/30 border border-purple-800/50 rounded-lg text-sm text-purple-300">{draft.storySummary.genre}</span>}
          {draft.storySummary.tone && <span className="px-3 py-1 bg-blue-900/30 border border-blue-800/50 rounded-lg text-sm text-blue-300">{draft.storySummary.tone}</span>}
          {draft.storySummary.theme && <span className="px-3 py-1 bg-green-900/30 border border-green-800/50 rounded-lg text-sm text-green-300">{draft.storySummary.theme}</span>}
          <span className="px-3 py-1 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-300">预估 {Math.round(draft.storySummary.estimatedDurationSec / 60)} 分钟</span>
        </div>

        {draft.storySummary.characters.length > 0 && (
          <div className="border-t border-gray-800 pt-5">
            <h4 className="text-sm font-medium text-gray-400 mb-3">角色 ({draft.storySummary.characters.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {draft.storySummary.characters.map(char => (
                <div key={char.id} className="bg-gray-950/50 rounded-xl p-4 border border-gray-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {char.name[0]}
                    </div>
                    <div className="font-medium text-white">{char.name}</div>
                  </div>
                  <p className="text-sm text-gray-400">{char.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scenes */}
      <div className="space-y-6">
        {draft.scenes.map(scene => (
          <SceneCard
            key={scene.id}
            scene={scene}
            expandedShots={expandedShots}
            onToggleShot={onToggleShot}
            onCopy={onCopy}
          />
        ))}
      </div>
    </section>
  );
}

function SceneCard({ scene, expandedShots, onToggleShot, onCopy }: {
  scene: Scene;
  expandedShots: Set<string>;
  onToggleShot: (id: string) => void;
  onCopy: (text: string) => void;
}) {
  const timeIcons: Record<string, string> = { day: '☀️', night: '🌙', dusk: '🌅', unknown: '❓' };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 bg-blue-600/20 border border-blue-600/30 rounded-xl">
            <span className="text-blue-400 font-bold">{scene.sequence}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-white">Scene {scene.sequence}</h3>
              <span className="text-gray-500">·</span>
              <span className="text-gray-300">{scene.location}</span>
              <span className={`px-2 py-0.5 rounded text-xs ${scene.timeOfDay === 'day' ? 'bg-yellow-900/30 text-yellow-400' : scene.timeOfDay === 'night' ? 'bg-indigo-900/30 text-indigo-400' : scene.timeOfDay === 'dusk' ? 'bg-orange-900/30 text-orange-400' : 'bg-gray-800 text-gray-400'}`}>
                {timeIcons[scene.timeOfDay] || '❓'} {scene.timeOfDay === 'day' ? '白天' : scene.timeOfDay === 'night' ? '夜晚' : scene.timeOfDay === 'dusk' ? '黄昏' : '未知'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{scene.summary}</p>
            <div className="text-xs text-gray-500 mt-1">
              {scene.shots.length} 个镜头 · 约{scene.shots.reduce((a, s) => a + (s.durationSec || 0), 0)}秒
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-800/50">
        {scene.shots.map(shot => (
          <ShotCard
            key={shot.id}
            shot={shot}
            expanded={expandedShots.has(shot.id)}
            onToggle={() => onToggleShot(shot.id)}
            onCopy={onCopy}
          />
        ))}
        {scene.shots.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">
            正在生成镜头...
          </div>
        )}
      </div>
    </div>
  );
}

function ShotCard({ shot, expanded, onToggle, onCopy }: {
  shot: Shot;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'kling' | 'runway' | 'sora'>('kling');
  const purposeLabels: Record<string, string> = { establishing: '建立', action: '动作', reaction: '反应', transition: '转场', closeup: '特写' };
  const emotionColors: Record<string, string> = { '平静': 'text-gray-400', '紧张': 'text-red-400', '悬疑': 'text-purple-400', '欢快': 'text-green-400', '悲伤': 'text-blue-400', '愤怒': 'text-red-500', '温情': 'text-pink-400', '浪漫': 'text-rose-400', '戏剧性': 'text-yellow-400' };

  return (
    <div className="px-6 py-4 hover:bg-gray-800/30 transition-colors">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-8 h-8 bg-gray-800 border border-gray-700 rounded-lg">
            <span className="text-gray-400 text-sm font-medium">{shot.sequence}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">{shot.shotType}</span>
            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">{shot.cameraAngle}</span>
            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">{shot.cameraMovement}</span>
            <span className={`text-xs font-medium ${emotionColors[shot.emotion] || 'text-gray-400'}`}>{shot.emotion}</span>
            <span className="text-xs text-gray-500">{shot.durationSec}秒</span>
            <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-800/50 rounded text-xs text-blue-400">{purposeLabels[shot.purpose] || shot.purpose}</span>
          </div>
        </div>
        <svg className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {shot.visualDescription && (
            <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800">
              <div className="text-xs font-medium text-gray-500 mb-2">画面描述</div>
              <p className="text-sm text-gray-300 leading-relaxed">{shot.visualDescription}</p>
            </div>
          )}

          <div className="bg-gray-950/50 rounded-xl overflow-hidden border border-gray-800">
            <div className="flex border-b border-gray-800">
              {(['kling', 'runway', 'sora'] as const).map(p => (
                <button key={p} onClick={() => setActiveTab(p)} className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === p ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-0.5 rounded ${shot.platformPrompts[activeTab]?.status === 'ready' ? 'bg-green-900/30 text-green-400' : shot.platformPrompts[activeTab]?.status === 'stale' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                  {shot.platformPrompts[activeTab]?.status === 'ready' ? '就绪' : shot.platformPrompts[activeTab]?.status === 'stale' ? '已过期' : '失败'}
                </span>
                <button onClick={() => onCopy(shot.platformPrompts[activeTab]?.text || '')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors">
                  复制 Prompt
                </button>
              </div>
              <p className="text-sm text-gray-300 font-mono leading-relaxed bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                {shot.platformPrompts[activeTab]?.text || '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 恢复弹窗
function RestoreModal({ savedDraft, onClose, onRestore, onRestoreJson, onDelete, restoreJson, setRestoreJson }: {
  savedDraft: StoryDraft | null;
  onClose: () => void;
  onRestore: () => void;
  onRestoreJson: () => void;
  onDelete: () => void;
  restoreJson: string;
  setRestoreJson: (v: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">恢复 Draft</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          {savedDraft && (
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="text-sm text-gray-300 mb-2">本地存储的 Draft</div>
              <div className="text-white font-medium mb-1">{savedDraft.storySummary.title}</div>
              <div className="text-xs text-gray-500 mb-3">{savedDraft.scenes.length} 场景 · {savedDraft.scenes.reduce((a, s) => a + s.shots.length, 0)} 镜头 · {savedDraft.generationMeta.lastGeneratedAt ? new Date(savedDraft.generationMeta.lastGeneratedAt).toLocaleString('zh-CN') : '无时间'}</div>
              <div className="flex gap-2">
                <button onClick={onRestore} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">恢复此 Draft</button>
                <button onClick={onDelete} className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 rounded-lg text-sm font-medium transition-colors">删除</button>
              </div>
            </div>
          )}

          {!savedDraft && (
            <div className="text-sm text-gray-500 text-center py-4">本地存储为空</div>
          )}

          <div className="border-t border-gray-800 pt-4">
            <div className="text-sm text-gray-300 mb-2">从 JSON 恢复</div>
            <p className="text-xs text-gray-500 mb-2">导出 JSON 后，粘贴内容到下方即可恢复</p>
            <textarea
              value={restoreJson}
              onChange={e => setRestoreJson(e.target.value)}
              placeholder='粘贴 JSON 内容...'
              rows={6}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-white placeholder-gray-600 font-mono text-xs focus:outline-none focus:border-blue-500 resize-y"
            />
            <button
              onClick={onRestoreJson}
              disabled={!restoreJson.trim()}
              className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
            >
              从 JSON 恢复
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
