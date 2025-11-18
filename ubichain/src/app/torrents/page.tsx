"use client";

import { useEffect, useState } from "react";
import { supabase } from '@/lib/supabase/client';
import { Flag, X } from "lucide-react";
import { useToast } from "@/components/ui/toast-1";

interface TorrentInfo {
  _id: string;
  name: string;
  magnetURI: string;
  torrentFileUrl: string;
  userId: string;
  uploaderName?: string;
  removed?: boolean;
}


const REPORT_REASONS = [
  { value: 'copyright', label: 'Copyright Violation' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'malware', label: 'Malware/Virus' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

export default function TorrentsPage() {
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [reportingTorrent, setReportingTorrent] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user.id);
    }
    loadUser();
  }, []);

  useEffect(() => {
    async function fetchTorrents() {
      setLoading(true);
      const res = await fetch('/api/torrents');
      const data = await res.json();
      let torrents: TorrentInfo[] = (data.torrents || []).filter((t: any) => !t.removed);
      // Fetch uploader names for each torrent
      const userIds = Array.from(new Set(torrents.map(t => t.userId)));
      console.log('MongoDB userIds:', userIds);
      const userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        // Supabase: get user profiles (assuming 'profiles' table with id, full_name)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        console.log('Supabase profiles:', profiles);
        if (profiles) {
          for (const profile of profiles) {
            userMap[profile.id] = profile.full_name || 'Unknown';
          }
        }
      }
      torrents = torrents.map(t => ({ ...t, uploaderName: userMap[t.userId] || 'Unknown' }));
      setTorrents(torrents);
      setLoading(false);
    }
    fetchTorrents();
  }, []);

  async function handleReport(torrentId: string) {
    if (!currentUser) {
      showToast('Please sign in to report content', 'error');
      return;
    }

    if (!reportReason) {
      showToast('Please select a reason', 'error');
      return;
    }

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          torrentId,
          reportedBy: currentUser,
          reason: reportReason,
          description: reportDescription,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit report');
      }

      showToast('Report submitted successfully', 'success');
      setReportingTorrent(null);
      setReportReason('');
      setReportDescription('');
    } catch (error: any) {
      console.error('Error reporting torrent:', error);
      showToast(error.message || 'Failed to submit report', 'error');
    }
  }

  return (
    <div className="min-h-screen relative pt-20">
      <div className="mx-auto max-w-3xl px-4 py-10 relative z-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
          {/* Glass reflection effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
          <div className="mb-4">
            <div className="text-white text-xl font-semibold">Available Torrents</div>
            <div className="text-sm text-white/60">Browse and download .torrent files</div>
          </div>
          {notification && (
            <div className="mb-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 backdrop-blur-md px-4 py-2.5 text-cyan-200 text-sm font-medium shadow-lg shadow-cyan-500/10">
              {notification}
            </div>
          )}
          <div className="space-y-4">
            {loading && <div className="text-white/60">Loading torrents...</div>}
            {!loading && torrents.length === 0 && <div className="text-white/60">No torrents available.</div>}
            {torrents.map((t, i) => (
              <div key={t._id || i} className="flex flex-col md:flex-row md:items-center md:justify-between rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg shadow-black/10 relative overflow-hidden mb-3">
                {/* Glass reflection effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between w-full">
                  <div className="mb-2 md:mb-0">
                    <div className="text-white/90 font-medium">{t.name}</div>
                    <div className="text-xs text-white/60">Uploaded by: {t.uploaderName}</div>
                  </div>
                  <div className="flex gap-2 mt-2 md:mt-0">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(t.torrentFileUrl);
                          if (!res.ok) throw new Error('Failed to fetch .torrent file');
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = t.name.endsWith('.torrent') ? t.name : `${t.name}.torrent`;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }, 100);
                        } catch (err) {
                          alert('Failed to download .torrent file.');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/20 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-white hover:bg-white/30 hover:border-white/40 transition-all duration-300 shadow-lg shadow-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Download .torrent
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          // Check if Clipboard API is available (requires HTTPS)
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(t.magnetURI);
                            setNotification('Magnet link copied to clipboard!');
                            setTimeout(() => setNotification(null), 2000);
                          } else {
                            // Fallback: Use a temporary textarea element for older browsers or HTTP
                            const textarea = document.createElement('textarea');
                            textarea.value = t.magnetURI;
                            textarea.style.position = 'fixed';
                            textarea.style.opacity = '0';
                            document.body.appendChild(textarea);
                            textarea.select();
                            try {
                              const successful = document.execCommand('copy');
                              if (successful) {
                                setNotification('Magnet link copied to clipboard!');
                                setTimeout(() => setNotification(null), 2000);
                              } else {
                                // If execCommand fails, show the magnet URI in an alert for manual copying
                                alert(`Magnet URI:\n\n${t.magnetURI}\n\nPlease copy this manually.`);
                              }
                            } catch (err) {
                              // If all methods fail, show the magnet URI in an alert
                              alert(`Magnet URI:\n\n${t.magnetURI}\n\nPlease copy this manually.`);
                            } finally {
                              document.body.removeChild(textarea);
                            }
                          }
                        } catch (err: any) {
                          // If clipboard API fails, show the magnet URI in an alert
                          console.error('Failed to copy to clipboard:', err);
                          alert(`Magnet URI:\n\n${t.magnetURI}\n\nPlease copy this manually.\n\nNote: Clipboard API requires HTTPS.`);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/20 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30 hover:border-cyan-400/50 transition-all duration-300 shadow-lg shadow-cyan-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Magnet Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportingTorrent(t._id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/20 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-red-200 hover:bg-red-500/30 hover:border-red-400/50 transition-all duration-300 shadow-lg shadow-red-500/20"
                    >
                      <Flag className="w-4 h-4" />
                      Report
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportingTorrent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden max-w-md w-full">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Report Content</h2>
                <button
                  onClick={() => {
                    setReportingTorrent(null);
                    setReportReason('');
                    setReportDescription('');
                  }}
                  className="text-white/60 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">Reason</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  >
                    <option value="">Select a reason</option>
                    {REPORT_REASONS.map((r) => (
                      <option key={r.value} value={r.value} className="bg-gray-800">
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">Description (optional)</label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder="Provide additional details..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReport(reportingTorrent)}
                    className="flex-1 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md text-red-300 hover:bg-red-500/20 transition-all"
                  >
                    Submit Report
                  </button>
                  <button
                    onClick={() => {
                      setReportingTorrent(null);
                      setReportReason('');
                      setReportDescription('');
                    }}
                    className="px-4 py-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
