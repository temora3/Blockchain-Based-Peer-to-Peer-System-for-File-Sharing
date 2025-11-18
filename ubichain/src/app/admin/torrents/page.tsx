"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { FileText, Search, Trash2, Download, ExternalLink, Loader2, User, Calendar, Flag, Ban } from "lucide-react";
import { useToast } from "@/components/ui/toast-1";

interface TorrentInfo {
  _id: string;
  name: string;
  magnetURI: string;
  torrentFileUrl: string;
  userId: string;
  createdAt: string;
  uploaderName?: string;
  removed?: boolean;
  reportCount?: number;
}

export default function AdminTorrents() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { showToast } = useToast();
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      loadTorrents();
    }
  }, [isAdmin, roleLoading]);

  async function loadTorrents() {
    try {
      setLoading(true);
      const res = await fetch('/api/torrents');
      const data = await res.json();
      let torrentsList: TorrentInfo[] = data.torrents || [];

      // Fetch uploader names
      const userIds = Array.from(new Set(torrentsList.map(t => t.userId)));
      const userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (profiles) {
          for (const profile of profiles) {
            userMap[profile.id] = profile.full_name || 'Unknown';
          }
        }
      }

      // Get report counts
      const reportsRes = await fetch('/api/reports');
      const reportsData = await reportsRes.json();
      const reports = reportsData.reports || [];
      const reportCounts: Record<string, number> = {};
      reports.forEach((r: any) => {
        reportCounts[r.torrentId] = (reportCounts[r.torrentId] || 0) + 1;
      });

      torrentsList = torrentsList.map(t => ({
        ...t,
        uploaderName: userMap[t.userId] || 'Unknown',
        reportCount: reportCounts[t._id] || 0,
      }));

      setTorrents(torrentsList);
    } catch (error: any) {
      console.error('Error loading torrents:', error);
      showToast('Failed to load torrents', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function deleteTorrent(torrentId: string) {
    if (!confirm('Are you sure you want to delete this torrent?')) return;

    try {
      const res = await fetch(`/api/torrents/${torrentId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete torrent');

      showToast('Torrent deleted successfully', 'success');
      loadTorrents();
    } catch (error: any) {
      console.error('Error deleting torrent:', error);
      showToast('Failed to delete torrent', 'error');
    }
  }

  const filteredTorrents = torrents.filter(torrent =>
    torrent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    torrent.uploaderName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Torrent Management</h1>
          </div>
          <p className="text-white/70">View and manage all shared torrents</p>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg shadow-black/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder="Search torrents by name or uploader..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all"
          />
        </div>
      </div>

      {/* Torrents List */}
      <div className="space-y-4">
        {filteredTorrents.filter(t => !t.removed).map((torrent) => (
          <div
            key={torrent._id}
            className={`rounded-2xl border backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden hover:bg-white/10 transition-all ${
              torrent.removed 
                ? 'border-red-500/30 bg-red-500/5' 
                : 'border-white/10 bg-white/5'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">{torrent.name}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-white/60">
                    <span className="flex items-center gap-1.5">
                      <User className="w-4 h-4" />
                      {torrent.uploaderName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {new Date(torrent.createdAt).toLocaleDateString()}
                    </span>
                    {torrent.reportCount && torrent.reportCount > 0 && (
                      <span className="flex items-center gap-1.5 text-red-300">
                        <Flag className="w-4 h-4" />
                        {torrent.reportCount} report{torrent.reportCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={torrent.torrentFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all text-sm flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                  <button
                    onClick={() => deleteTorrent(torrent._id)}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 backdrop-blur-md text-red-300 hover:bg-red-500/20 transition-all text-sm flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md">
                <p className="text-xs text-white/40 mb-1">Magnet URI</p>
                <p className="text-sm text-white/70 font-mono break-all">{torrent.magnetURI}</p>
              </div>
            </div>
          </div>
        ))}
        {filteredTorrents.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 text-center">
            <p className="text-white/50">No torrents found</p>
          </div>
        )}
      </div>
    </div>
  );
}

