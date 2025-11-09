"use client";

import { useEffect, useState } from "react";
import { supabase } from '@/lib/supabase/client';

interface TorrentInfo {
  name: string;
  magnetURI: string;
  torrentFileUrl: string;
  userId: string;
  uploaderName?: string;
}


export default function TorrentsPage() {
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTorrents() {
      setLoading(true);
      const res = await fetch('/api/torrents');
      const data = await res.json();
      let torrents: TorrentInfo[] = data.torrents || [];
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
          <div className="mb-4">
            <div className="text-white text-xl font-semibold">Available Torrents</div>
            <div className="text-sm text-zinc-400">Browse and download .torrent files</div>
          </div>
          {notification && (
            <div className="mb-4 rounded-lg bg-cyan-900/80 px-4 py-2 text-cyan-100 text-sm font-medium shadow">
              {notification}
            </div>
          )}
          <div className="space-y-4">
            {loading && <div className="text-zinc-400">Loading torrents...</div>}
            {!loading && torrents.length === 0 && <div className="text-zinc-400">No torrents available.</div>}
            {torrents.map((t, i) => (
              <div key={i} className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-zinc-800 py-2">
                <div>
                  <div className="text-zinc-200 font-medium">{t.name}</div>
                  <div className="text-xs text-zinc-400">Uploaded by: {t.uploaderName}</div>
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
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
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
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs text-cyan-300 ring-1 ring-inset ring-cyan-700 hover:bg-cyan-900"
                  >
                    Magnet Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
