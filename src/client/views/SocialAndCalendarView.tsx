import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  FolderOpen,
  ImagePlus,
  Send,
  Share2,
  Sparkles,
} from 'lucide-react';
import type {
  Campaign,
  ContentAsset,
  SocialAccount,
  SocialPlatform,
  SocialPost,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface SocialAndCalendarViewProps {
  workspaceId: string;
  userTimezone: string;
  initialTab?: 'composer' | 'accounts' | 'studio' | 'calendar';
}

const PLATFORMS: Array<{ id: SocialPlatform; label: string }> = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X (Twitter)' },
  { id: 'youtube', label: 'YouTube' },
];

export const SocialAndCalendarView: React.FC<SocialAndCalendarViewProps> = ({
  workspaceId,
  userTimezone,
  initialTab = 'composer',
}) => {
  const [tab, setTab] = useState<'composer' | 'accounts' | 'studio' | 'calendar'>(initialTab);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'list'>('list');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Composer State (clean empty defaults)
  const [title, setTitle] = useState('');
  const [baseIdea, setBaseIdea] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['linkedin', 'x']);
  const [scheduledAt, setScheduledAt] = useState('');
  const [variations, setVariations] = useState<SocialPost['variations']>({
    linkedin: { content: '', hashtags: [], cta: '' },
    instagram: { content: '', hashtags: [], cta: '' },
    facebook: { content: '', hashtags: [], cta: '' },
    x: { content: '', hashtags: [], cta: '' },
    youtube: { content: '', hashtags: [], cta: '' },
  });
  const [aiBusy, setAiBusy] = useState(false);

  // Connect Account State
  const [newAccPlatform, setNewAccPlatform] = useState<SocialPlatform>('linkedin');
  const [newAccName, setNewAccName] = useState('');
  const [newAccHandle, setNewAccHandle] = useState('');

  // Asset Upload
  const [assetName, setAssetName] = useState('');
  const [assetFolder, setAssetFolder] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadAll = async () => {
    try {
      const [socRes, campRes] = await Promise.all([api.getSocial(), api.getCampaigns()]);
      setAccounts(socRes.accounts);
      setPosts(socRes.posts);
      setAssets(socRes.assets);
      setCampaigns(campRes.campaigns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load social workspace');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAiVariations = async () => {
    if (!baseIdea.trim()) return;
    setAiBusy(true);
    setError('');
    try {
      const res = await api.generateAI({
        kind: 'social_variations',
        prompt: baseIdea,
        tone: 'Authoritative B2B',
      });
      try {
        const parsed = JSON.parse(res.text);
        setVariations((prev) => ({
          linkedin: parsed.linkedin || prev.linkedin,
          instagram: parsed.instagram || prev.instagram,
          facebook: parsed.facebook || prev.facebook,
          x: parsed.x || prev.x,
          youtube: parsed.youtube || prev.youtube,
        }));
      } catch {
        setVariations((prev) => ({
          ...prev,
          linkedin: { ...prev.linkedin, content: res.text },
        }));
      }
      setNotice(`AI (${res.provider}) generated tailored platform variations.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI generation failed');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSavePost = async () => {
    if (!title.trim() && !baseIdea.trim()) {
      setError('Enter a post title or campaign idea before saving.');
      return;
    }
    setError('');
    try {
      await api.createSocialPost({
        workspaceId,
        title: title || baseIdea.slice(0, 60),
        baseIdea,
        platforms: selectedPlatforms,
        variations,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      setTitle('');
      setNotice('Social post saved as draft.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save post');
    }
  };

  const handleConnectAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim() || !newAccHandle.trim()) return;
    setError('');
    try {
      await api.createSocialAccount({
        workspaceId,
        platform: newAccPlatform,
        displayName: newAccName.trim(),
        handle: newAccHandle.trim(),
      });
      setNewAccName('');
      setNewAccHandle('');
      setNotice(`Connected ${newAccPlatform} channel.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect account');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.createAsset({
          workspaceId,
          name: assetName || file.name,
          folder: assetFolder || 'General',
          type: file.type.startsWith('video') ? 'video' : 'image',
          mimeType: file.type || 'image/png',
          sizeBytes: file.size,
          url: String(reader.result),
          tags: ['uploaded'],
        });
        setAssetName('');
        setNotice(`Uploaded "${file.name}" to Media Library.`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  const unifiedCalendarItems = [
    ...posts
      .filter((p) => p.scheduledAt || p.publishedAt)
      .map((p) => ({
        id: p.id,
        kind: 'Social Post',
        platforms: p.platforms.join(', '),
        title: p.title,
        status: p.status,
        utcIso: (p.scheduledAt || p.publishedAt)!,
      })),
    ...campaigns
      .filter((c) => c.scheduledAt || c.sentAt)
      .map((c) => ({
        id: c.id,
        kind: 'Email Campaign',
        platforms: 'Email',
        title: c.name,
        status: c.status,
        utcIso: (c.scheduledAt || c.sentAt)!,
      })),
  ].sort((a, b) => a.utcIso.localeCompare(b.utcIso));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
          {[
            { id: 'composer', label: 'Social Composer' },
            { id: 'accounts', label: `Channels (${accounts.length})` },
            { id: 'studio', label: `Media (${assets.length})` },
            { id: 'calendar', label: `Calendar (${unifiedCalendarItems.length})` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`px-3 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap min-h-[36px] ${
                tab === item.id ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">Timezone: {userTimezone}</div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

      {/* SOCIAL COMPOSER & PUBLISHING QUEUE */}
      {tab === 'composer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#1D63ED]" /> Multi-Platform Social Composer
            </h3>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Internal post title..."
              className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
            />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Core Campaign Idea</label>
              <textarea
                rows={3}
                value={baseIdea}
                onChange={(e) => setBaseIdea(e.target.value)}
                placeholder="Describe your announcement, product launch, or campaign topic..."
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                disabled={aiBusy || !baseIdea.trim()}
                onClick={handleAiVariations}
                className="mt-2 w-full sm:w-auto px-3.5 py-2 bg-[#1D63ED] disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {aiBusy ? 'Generating Variations...' : 'Generate Platform Variations with AI'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Target Platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const active = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setSelectedPlatforms((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                        )
                      }
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer min-h-[38px] ${
                        active ? 'bg-[#1D63ED] text-white border-[#1D63ED]' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlatforms.map((plat) => (
              <div key={plat} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="text-xs font-bold text-[#0A2472] uppercase">{plat} Copy</div>
                <textarea
                  rows={3}
                  value={variations[plat]?.content || ''}
                  onChange={(e) =>
                    setVariations((v) => ({
                      ...v,
                      [plat]: { ...v[plat], content: e.target.value },
                    }))
                  }
                  placeholder={`Write tailored ${plat} post...`}
                  className="w-full px-2.5 py-2 text-base sm:text-xs bg-white border border-slate-200 rounded-md"
                />
              </div>
            ))}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg min-h-[40px]"
              />
              <button
                type="button"
                onClick={handleSavePost}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#0A2472] text-white text-xs font-semibold rounded-lg cursor-pointer min-h-[42px]"
              >
                Save Post Draft
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <h3 className="text-base font-bold text-[#0A2472]">Publishing Queue & History</h3>
            {posts.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No social posts drafted yet. Create your first post in the composer.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {posts.map((post) => (
                  <div key={post.id} className="py-3.5 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 break-words">{post.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {post.platforms.join(' · ')} · Author: {post.authorName} · Status:{' '}
                          <span className="font-semibold text-[#1D63ED] capitalize">{post.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        {['draft', 'needs_revision'].includes(post.status) && (
                          <button
                            type="button"
                            onClick={async () => {
                              await api.submitSocialApproval(post.id);
                              setNotice('Submitted social post for approval.');
                              await loadAll();
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium bg-amber-50 border border-amber-200 text-amber-800 rounded cursor-pointer min-h-[36px]"
                          >
                            Submit Approval
                          </button>
                        )}
                        {post.status !== 'published' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.publishSocialPost(post.id);
                                setNotice('Social post marked as published.');
                                await loadAll();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Publish blocked');
                              }
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-[#1D63ED] text-white rounded inline-flex items-center gap-1 cursor-pointer min-h-[36px]"
                          >
                            <Send className="w-3 h-3" /> Publish
                          </button>
                        )}
                      </div>
                    </div>
                    {post.status === 'published' && (
                      <div className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg font-mono tabular-nums">
                        {post.metricsAvailable && post.metrics
                          ? `Reach: ${post.metrics.reach ?? 'N/A'} · Impressions: ${post.metrics.impressions ?? 'N/A'} · Likes: ${post.metrics.likes ?? 'N/A'} · Clicks: ${post.metrics.clicks ?? 'N/A'}`
                          : 'Analytics: Not available from this connected provider.'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONNECTED ACCOUNTS & CAPABILITY MATRIX */}
      {tab === 'accounts' && (
        <div className="space-y-6">
          <form onSubmit={handleConnectAccount} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <h3 className="text-base font-bold text-[#0A2472]">Connect Social Channel</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <select
                value={newAccPlatform}
                onChange={(e) => setNewAccPlatform(e.target.value as SocialPlatform)}
                className="px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg bg-white"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <input
                type="text"
                required
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                placeholder="Page or Channel Name"
                className="px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                required
                value={newAccHandle}
                onChange={(e) => setNewAccHandle(e.target.value)}
                placeholder="@handle"
                className="px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer min-h-[42px]"
              >
                + Connect Channel
              </button>
            </div>
          </form>

          {accounts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No social accounts connected in this organization yet. Connect a channel above to manage capabilities and publishing.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <div key={acc.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-[#1D63ED]">{acc.platform}</span>
                      <span className="text-xs font-medium text-slate-600 capitalize">{acc.status.replace('_', ' ')}</span>
                    </div>
                    <h4 className="text-base font-bold text-[#0A2472] mt-1">{acc.displayName}</h4>
                    <div className="text-xs text-slate-500">{acc.handle} · {acc.accountType}</div>
                    <div className="mt-3 text-xs space-y-1 text-slate-600">
                      <div>Text: {acc.capabilities.publishText ? 'Supported' : 'Not supported'}</div>
                      <div>Image/Video: {acc.capabilities.publishImage ? 'Image' : 'No Image'} / {acc.capabilities.publishVideo ? 'Video' : 'No Video'}</div>
                      <div>Analytics API: {acc.capabilities.fetchAnalytics ? 'Supported' : 'Not available'}</div>
                    </div>
                    {acc.capabilities.limitationNote && (
                      <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                        {acc.capabilities.limitationNote}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.toggleSocialAccount(acc.id);
                      await loadAll();
                    }}
                    className="w-full py-2.5 border border-slate-200 rounded-lg text-xs font-semibold hover:border-[#1D63ED] hover:text-[#1D63ED] cursor-pointer min-h-[40px]"
                  >
                    {acc.status === 'disconnected' ? 'Connect Account' : 'Disconnect Account'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTENT STUDIO & MEDIA LIBRARY */}
      {tab === 'studio' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#1D63ED]" /> Media Asset Library
              </h3>
              <p className="text-xs text-slate-500">Upload images or videos through the storage provider abstraction.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="Asset label..."
                className="px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg w-full"
              />
              <input
                type="text"
                value={assetFolder}
                onChange={(e) => setAssetFolder(e.target.value)}
                placeholder="Folder (e.g. Visuals)"
                className="px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg w-full"
              />
              <label className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer min-h-[40px]">
                <ImagePlus className="w-3.5 h-3.5" /> Upload Asset
                <input type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {assets.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No media assets uploaded yet. Upload your first image or video above.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <div key={asset.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="h-32 bg-[#F4F7FE] flex items-center justify-center p-4 border-b border-slate-100">
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="max-h-full max-w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-semibold text-slate-900 truncate">{asset.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {asset.folder} · {Math.round(asset.sizeBytes / 1024)} KB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* UNIFIED CONTENT CALENDAR */}
      {tab === 'calendar' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#1D63ED]" /> Unified Content Calendar
              </h3>
              <p className="text-xs text-slate-500">Stored in UTC · Displayed in {userTimezone}</p>
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
              {(['month', 'week', 'day', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCalendarView(v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded capitalize cursor-pointer min-h-[34px] ${
                    calendarView === v ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {unifiedCalendarItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No scheduled email campaigns or social posts yet. Schedule a campaign or social post to see it on the calendar.
            </div>
          ) : (
            <div className={calendarView === 'month' || calendarView === 'week' ? 'grid grid-cols-1 md:grid-cols-3 gap-3' : 'divide-y divide-slate-100'}>
              {unifiedCalendarItems.map((item) => (
                <div
                  key={`${item.kind}-${item.id}`}
                  className={
                    calendarView === 'month' || calendarView === 'week'
                      ? 'p-3.5 border border-slate-200 rounded-xl bg-[#F8FAFC]'
                      : 'py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2'
                  }
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1D63ED]">
                      {item.kind} · {item.platforms}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5 break-words">{item.title}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {new Date(item.utcIso).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="capitalize font-medium text-slate-700">{item.status.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
