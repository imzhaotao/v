'use client';

import { useState, useEffect } from 'react';
import type { StoryDraft, Scene, Shot } from '@/types/draft';
import { exportAsJson, exportAsMarkdown, exportAsCsv, downloadFile } from '@/lib/export';

const AVAILABLE_MODELS = (process.env.NEXT_PUBLIC_AVAILABLE_MODELS || 'deepseek,minimax').split(',').map(m => m.trim());
const MODEL_LABELS: Record<string, string> = { deepseek: 'DeepSeek V3', minimax: 'MiniMax M2.7' };

type ProgressStep = 'idle' | 'analyzing' | 'expanding' | 'done' | 'error';

interface DraftListItem {
  id: string;
  title: string | null;
  story_text: string;
  storyText?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export default function Home() {
  const [storyText, setStoryText] = useState('');
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<string>('minimax');
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressStep>('idle');
  const [progressText, setProgressText] = useState('');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [totalScenes, setTotalScenes] = useState(0);
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set());
  const [draftList, setDraftList] = useState<DraftListItem[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    loadDraftList();
  }, []);

  async function loadDraftList() {
    setDbError(null);
    try {
      const res = await fetch('/api/drafts');
      const data: { drafts?: DraftListItem[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || '数据库读取失败');
      setDraftList(data.drafts || []);
    } catch (e: unknown) {
      setDbError('数据库读取失败：' + getErrorMessage(e));
    }
  }

  async function handleGenerate() {
    if (!storyText.trim() || storyText.length < 20) return;

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
              setTotalScenes(data.data?.scenes?.length || 0);
            } else if (data.type === 'scene_progress') {
              setSceneIndex(data.sceneIndex + 1);
              setProgressText(`生成场景 ${data.sceneIndex + 1}/${data.totalScenes}...`);
            } else if (data.type === 'done') {
              setProgress('done');
              setProgressText('生成完成');
              setDraft(data.draft);
              // 自动保存到数据库
              autoSaveDraft(data.draft);
              loadDraftList();
            } else if (data.error) {
              throw new Error(data.error);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
      setProgress('error');
    } finally {
      setLoading(false);
    }
  }

  async function autoSaveDraft(draftData: StoryDraft) {
    if (!draftData.id) return;
    try {
      await fetch(`/api/drafts/${draftData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storySummary: draftData.storySummary,
          scenes: draftData.scenes,
          status: draftData.status,
        }),
      });
    } catch {
      // 自动保存失败不阻塞流程
    }
  }

  function handleClear() {
    setStoryText('');
    setTitle('');
    setDraft(null);
    setError(null);
    setProgress('idle');
    setProgressText('');
    setExpandedShots(new Set());
  }

  function toggleShot(id: string) {
    const next = new Set(expandedShots);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedShots(next);
  }

  function copyPrompt(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800/50 bg-gray-950/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Story to Video
            </h1>
            <p className="text-xs text-gray-500">AI 分镜生成工作台</p>
          </div>
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            历史
            {draftList.length > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {draftList.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 relative">
        {/* 历史记录侧边栏 */}
        <aside className={`absolute top-0 right-0 h-full w-80 bg-gray-900/95 border-l border-gray-800 transform transition-transform z-10 ${historyOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">历史记录</h2>
            <button onClick={() => setHistoryOpen(false)} className="text-gray-500 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto h-[calc(100%-57px)] p-3 space-y-2">
            {dbError && (
              <div className="text-xs text-red-400 p-2">{dbError}</div>
            )}
            {draftList.length === 0 && !dbError && (
              <div className="text-xs text-gray-500 p-2">暂无历史记录</div>
            )}
            {draftList.map(d => (
              <button
                key={d.id}
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/drafts/${d.id}`);
                    const data: (StoryDraft & { error?: string }) | { error?: string } = await res.json();
                    if (!res.ok) throw new Error((data as { error?: string }).error || '读取失败');
                    const loadedDraft = data as StoryDraft;
                    setDraft(loadedDraft);
                    setStoryText(loadedDraft.source?.storyText || '');
                    setTitle(loadedDraft.source?.title || '');
                    setHistoryOpen(false);
                  } catch (e: unknown) {
                    alert('读取失败：' + getErrorMessage(e));
                  }
                }}
                className="w-full text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-800 rounded-lg p-3 pr-8 transition-colors relative group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{d.title || '未命名'}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === 'ready' ? 'bg-green-400' : d.status === 'failed' ? 'bg-red-400' : 'bg-blue-400'}`} />
                </div>
                <div className="text-xs text-gray-500">{new Date(d.created_at).toLocaleString('zh-CN')}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm('确定删除？')) return;
                    fetch(`/api/drafts/${d.id}`, { method: 'DELETE' })
                      .then(r => r.json())
                      .then(data => { if (data.error) alert('删除失败'); else loadDraftList(); })
                      .catch(() => alert('删除失败'));
                  }}
                  className="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </button>
            ))}
          </div>
        </aside>

        {/* 主内容 */}
        <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6">
          {/* 输入区 */}
          <section className="mb-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">标题（可选）</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="给故事起个标题"
                    className="w-full px-3 py-2.5 bg-gray-950/50 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">模型</label>
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-950/50 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m} value={m}>{MODEL_LABELS[m] || m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={loading || !storyText.trim() || storyText.length < 20}
                    className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-500/20"
                  >
                    {loading ? '生成中...' : '生成 Draft'}
                  </button>
                  <button onClick={handleClear} className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition-all">
                    清空
                  </button>
                </div>
              </div>

              <div className="relative">
                <textarea
                  value={storyText}
                  onChange={e => setStoryText(e.target.value)}
                  placeholder="粘贴你的短篇故事...（至少 20 字）"
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-950/50 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm leading-relaxed"
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-3">
                  {storyText.length > 0 && storyText.length < 20 && (
                    <span className="text-xs text-orange-400">还差 {20 - storyText.length} 字</span>
                  )}
                  <span className={`text-xs ${storyText.length < 20 ? 'text-red-400' : 'text-gray-500'}`}>
                    {storyText.length.toLocaleString()} 字
                  </span>
                </div>
              </div>

              {/* 进度 */}
              {loading && (
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/40 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-blue-300 text-sm font-medium">{progressText}</span>
                  </div>
                  {totalScenes > 0 && (
                    <div className="text-xs text-gray-400 mb-1.5">场景进度：{sceneIndex} / {totalScenes}</div>
                  )}
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: progress === 'expanding' && totalScenes > 0 ? `${(sceneIndex / totalScenes) * 100}%` : '30%' }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-3 p-3 bg-red-900/20 border border-red-800/40 rounded-xl text-red-300 text-sm">
                  <span className="font-medium">错误：</span>{error}
                </div>
              )}
            </div>
          </section>

          {/* Draft 结果 */}
          {draft && (
            <DraftView
              draft={draft}
              onDraftChange={setDraft}
              expandedShots={expandedShots}
              onToggleShot={toggleShot}
              onCopy={copyPrompt}
              onSave={async () => {
                try {
                  if (!draft.id) throw new Error('无 ID，请重新生成');
                  const res = await fetch(`/api/drafts/${draft.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      storySummary: draft.storySummary,
                      scenes: draft.scenes,
                      status: draft.status,
                    }),
                  });
                  const data: { error?: string } = await res.json();
                  if (!res.ok) throw new Error(data.error || '保存失败');
                  alert('已保存');
                  loadDraftList();
                } catch (e: unknown) {
                  alert('保存失败：' + getErrorMessage(e));
                }
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function DraftView({ draft, onDraftChange, expandedShots, onToggleShot, onCopy, onSave }: {
  draft: StoryDraft;
  onDraftChange: (draft: StoryDraft) => void;
  expandedShots: Set<string>;
  onToggleShot: (id: string) => void;
  onCopy: (text: string) => void;
  onSave: () => void;
}) {
  const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
    generating: { label: '生成中', bg: 'bg-blue-900', text: 'text-blue-300' },
    ready: { label: '就绪', bg: 'bg-green-900', text: 'text-green-300' },
    partial_failed: { label: '部分失败', bg: 'bg-yellow-900', text: 'text-yellow-300' },
    failed: { label: '失败', bg: 'bg-red-900', text: 'text-red-300' },
  };

  return (
    <section>
      {/* 状态栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{draft.storySummary.title || 'Draft'}</h2>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[draft.status]?.bg} ${statusConfig[draft.status]?.text}`}>
            {statusConfig[draft.status]?.label || draft.status}
          </span>
          <span className="text-xs text-gray-500">{draft.scenes.length} 场景</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-xs bg-green-900/30 hover:bg-green-900/50 border border-green-800/50 text-green-400 rounded-lg transition-colors"
          >
            保存
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
            MD
          </button>
          <button
            onClick={() => downloadFile(exportAsCsv(draft), `${draft.storySummary.title || 'draft'}.csv`, 'text/csv')}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            CSV
          </button>
        </div>
      </div>

      {/* 故事信息 */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {draft.storySummary.genre && <span className="px-2.5 py-1 bg-purple-900/30 border border-purple-800/40 rounded-lg text-xs text-purple-300">{draft.storySummary.genre}</span>}
          {draft.storySummary.tone && <span className="px-2.5 py-1 bg-blue-900/30 border border-blue-800/40 rounded-lg text-xs text-blue-300">{draft.storySummary.tone}</span>}
          {draft.storySummary.theme && <span className="px-2.5 py-1 bg-green-900/30 border border-green-800/40 rounded-lg text-xs text-green-300">{draft.storySummary.theme}</span>}
          <span className="px-2.5 py-1 bg-gray-800/50 border border-gray-700 rounded-lg text-xs text-gray-300">约 {Math.round(draft.storySummary.estimatedDurationSec / 60)} 分钟</span>
        </div>

        {draft.storySummary.characters.length > 0 && (
          <div className="border-t border-gray-800 pt-4">
            <h4 className="text-xs font-medium text-gray-400 mb-2">角色</h4>
            <div className="flex flex-wrap gap-3">
              {draft.storySummary.characters.map(char => (
                <div key={char.id} className="flex flex-col items-center gap-1.5 bg-gray-950/50 rounded-xl p-3 border border-gray-800 w-28">
                  {char.imageUrl ? (
                    <img src={char.imageUrl} alt={char.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-700" />
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-lg font-bold border-2 border-blue-500/50">
                      {char.name[0]}
                    </div>
                  )}
                  <span className="text-sm font-medium text-white text-center">{char.name}</span>
                  <span className="text-xs text-gray-500 text-center leading-tight">{char.description.slice(0, 20)}...</span>
                  {!char.imageUrl && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!draft.id) return;
                        const imgResult = await fetch('/api/generate-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ characterName: char.name, description: char.description, draftId: draft.id, characterId: char.id }),
                        }).then(r => r.json());
                        if (imgResult.error) { alert('生成失败：' + imgResult.error); return; }
                        // 更新本地 draft
                        const updated = {
                          ...draft,
                          storySummary: {
                            ...draft.storySummary,
                            characters: draft.storySummary.characters.map(c =>
                              c.id === char.id ? { ...c, imageUrl: imgResult.url } : c
                            ),
                          },
                        };
                        onDraftChange(updated);
                        // 保存到数据库
                        await fetch(`/api/drafts/${draft.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ storySummary: updated.storySummary }),
                        });
                      }}
                      className="mt-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors w-full"
                    >
                      生成图片
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scenes */}
      <div className="space-y-3">
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
  const timeLabels: Record<string, string> = { day: '白天', night: '夜晚', dusk: '黄昏', unknown: '未知' };

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800/50 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600/20 border border-blue-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-blue-400 font-bold text-sm">{scene.sequence}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">Scene {scene.sequence}</span>
            <span className="text-gray-500 text-xs">·</span>
            <span className="text-sm text-gray-300">{scene.location}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${scene.timeOfDay === 'day' ? 'bg-yellow-900/30 text-yellow-400' : scene.timeOfDay === 'night' ? 'bg-indigo-900/30 text-indigo-400' : scene.timeOfDay === 'dusk' ? 'bg-orange-900/30 text-orange-400' : 'bg-gray-800 text-gray-400'}`}>
              {timeLabels[scene.timeOfDay]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{scene.summary}</p>
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">{scene.shots.length} 镜 · {scene.shots.reduce((a, s) => a + (s.durationSec || 0), 0)}s</span>
      </div>

      <div>
        {scene.shots.map(shot => (
          <ShotCard
            key={shot.id}
            shot={shot}
            expanded={expandedShots.has(shot.id)}
            onToggle={() => onToggleShot(shot.id)}
            onCopy={onCopy}
          />
        ))}
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
    <div className="border-t border-gray-800/30">
      <div className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-800/30 transition-colors" onClick={onToggle}>
        <span className="text-gray-500 text-xs font-mono w-4">{shot.sequence}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="px-1.5 py-0.5 bg-gray-800 rounded text-xs text-gray-300">{shot.shotType}</span>
          <span className="px-1.5 py-0.5 bg-gray-800 rounded text-xs text-gray-400">{shot.cameraAngle}</span>
          <span className={`text-xs font-medium ${emotionColors[shot.emotion] || 'text-gray-400'}`}>{shot.emotion}</span>
          <span className="px-1.5 py-0.5 bg-blue-900/30 border border-blue-800/40 rounded text-xs text-blue-400">{purposeLabels[shot.purpose] || shot.purpose}</span>
        </div>
        <span className="text-xs text-gray-500">{shot.durationSec}s</span>
        <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {shot.visualDescription && (
            <div className="bg-gray-950/50 rounded-lg p-3 border border-gray-800">
              <div className="text-xs font-medium text-gray-500 mb-1.5">画面描述</div>
              <p className="text-sm text-gray-300 leading-relaxed">{shot.visualDescription}</p>
            </div>
          )}

          <div className="bg-gray-950/50 rounded-lg border border-gray-800 overflow-hidden">
            <div className="flex">
              {(['kling', 'runway', 'sora'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setActiveTab(p)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === p ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${shot.platformPrompts[activeTab]?.status === 'ready' ? 'bg-green-900/30 text-green-400' : shot.platformPrompts[activeTab]?.status === 'stale' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                  {shot.platformPrompts[activeTab]?.status === 'ready' ? '就绪' : shot.platformPrompts[activeTab]?.status === 'stale' ? '已过期' : '失败'}
                </span>
                <button onClick={() => onCopy(shot.platformPrompts[activeTab]?.text || '')} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors">
                  复制
                </button>
              </div>
              <p className="text-xs text-gray-300 font-mono leading-relaxed bg-gray-900/50 p-2 rounded border border-gray-800 break-all">
                {shot.platformPrompts[activeTab]?.text || '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
