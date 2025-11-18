"use client";

import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/lib/supabase/client";
import { AlertTriangle, Flag, Shield, Loader2, CheckCircle, XCircle, Eye, Trash2, Ban, MessageSquare, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast-1";
import { motion } from "framer-motion";

interface Report {
  _id: string;
  torrentId: string;
  reportedBy: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed' | 'appealed';
  reviewedBy?: string;
  reviewedAt?: string;
  action?: 'removed' | 'kept' | 'warning';
  appealReason?: string;
  createdAt: string;
  updatedAt: string;
  torrentName?: string;
  reporterName?: string;
  uploaderName?: string;
}

const REPORT_REASONS: Record<string, string> = {
  'copyright': 'Copyright Violation',
  'inappropriate': 'Inappropriate Content',
  'malware': 'Malware/Virus',
  'spam': 'Spam',
  'other': 'Other',
};

export default function AdminModeration() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { showToast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'appealed'>('pending');
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      loadCurrentUser();
      loadReports();
    }
  }, [isAdmin, roleLoading, filter]);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUser(user.id);
  }

  async function loadReports() {
    try {
      setLoading(true);
      const status = filter === 'all' ? null : filter;
      const url = status ? `/api/reports?status=${status}` : '/api/reports';
      const res = await fetch(url);
      const data = await res.json();
      let reportsList: Report[] = data.reports || [];

      // Fetch torrent names and user names
      const torrentIds = Array.from(new Set(reportsList.map(r => r.torrentId)));
      const userIds = Array.from(new Set([
        ...reportsList.map(r => r.reportedBy),
        ...reportsList.map(r => r.reviewedBy).filter(Boolean),
      ]));

      // Get torrents
      const torrentsRes = await fetch('/api/torrents');
      const torrentsData = await torrentsRes.json();
      const torrents = torrentsData.torrents || [];
      const torrentMap: Record<string, any> = {};
      torrents.forEach((t: any) => {
        torrentMap[t._id] = t;
      });

      // Get user names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const userMap: Record<string, string> = {};
      if (profiles) {
        profiles.forEach(p => {
          userMap[p.id] = p.full_name || 'Unknown';
        });
      }

      reportsList = reportsList.map(r => ({
        ...r,
        torrentName: torrentMap[r.torrentId]?.name || 'Unknown',
        reporterName: userMap[r.reportedBy] || 'Unknown',
        uploaderName: torrentMap[r.torrentId] ? userMap[torrentMap[r.torrentId].userId] : 'Unknown',
      }));

      setReports(reportsList);
    } catch (error: any) {
      console.error('Error loading reports:', error);
      showToast('Failed to load reports', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(reportId: string, action: 'removed' | 'kept' | 'warning', status: 'resolved' | 'dismissed') {
    if (!currentUser) {
      showToast('User not authenticated', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          action,
          reviewedBy: currentUser,
        }),
      });

      if (!res.ok) throw new Error('Failed to update report');

      showToast(`Report ${status === 'resolved' ? 'resolved' : 'dismissed'}`, 'success');
      loadReports();
      setSelectedReport(null);
    } catch (error: any) {
      console.error('Error reviewing report:', error);
      showToast('Failed to review report', 'error');
    }
  }

  async function handleAppeal(reportId: string, appealReason: string) {
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appealReason,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit appeal');

      showToast('Appeal submitted successfully', 'success');
      loadReports();
      setSelectedReport(null);
    } catch (error: any) {
      console.error('Error submitting appeal:', error);
      showToast('Failed to submit appeal', 'error');
    }
  }

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  const pendingReports = reports.filter(r => r.status === 'pending');
  const appealedReports = reports.filter(r => r.status === 'appealed');

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Content Moderation</h1>
          </div>
          <p className="text-white/70">Review and moderate reported content</p>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
            <h3 className="text-sm uppercase tracking-wide text-white/60 mb-1">Pending Reviews</h3>
            <p className="text-3xl font-bold text-white">{pendingReports.length}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <MessageSquare className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-sm uppercase tracking-wide text-white/60 mb-1">Appeals</h3>
            <p className="text-3xl font-bold text-white">{appealedReports.length}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <Flag className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-sm uppercase tracking-wide text-white/60 mb-1">Total Reports</h3>
            <p className="text-3xl font-bold text-white">{reports.length}</p>
          </div>
        </motion.div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'pending', label: 'Pending', count: pendingReports.length },
          { key: 'appealed', label: 'Appeals', count: appealedReports.length },
          { key: 'all', label: 'All Reports', count: reports.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-4 py-2 rounded-xl border transition-all ${
              filter === tab.key
                ? 'border-white/30 bg-white/20 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Review Queue */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 text-center">
            <Flag className="w-12 h-12 text-white/40 mx-auto mb-4" />
            <p className="text-white/50">No reports found</p>
          </div>
        ) : (
          reports.map((report) => (
            <motion.div
              key={report._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-white">{report.torrentName}</h3>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        report.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                        report.status === 'appealed' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                        report.status === 'resolved' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                        'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                      }`}>
                        {report.status}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-white/60">
                      <p>Reported by: {report.reporterName}</p>
                      <p>Uploader: {report.uploaderName}</p>
                      <p>Reason: {REPORT_REASONS[report.reason] || report.reason}</p>
                      {report.description && <p>Description: {report.description}</p>}
                      <p>Reported: {new Date(report.createdAt).toLocaleString()}</p>
                      {report.appealReason && (
                        <div className="mt-2 p-2 rounded-lg border border-blue-500/30 bg-blue-500/10">
                          <p className="text-blue-300 text-xs font-medium mb-1">Appeal Reason:</p>
                          <p className="text-blue-200/80 text-sm">{report.appealReason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedReport(report)}
                      className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all text-sm flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      Review
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Review Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative">
              <h2 className="text-2xl font-bold text-white mb-4">Review Report</h2>
              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-sm text-white/60 mb-1">Torrent</p>
                  <p className="text-white">{selectedReport.torrentName}</p>
                </div>
                <div>
                  <p className="text-sm text-white/60 mb-1">Reason</p>
                  <p className="text-white">{REPORT_REASONS[selectedReport.reason] || selectedReport.reason}</p>
                </div>
                {selectedReport.description && (
                  <div>
                    <p className="text-sm text-white/60 mb-1">Description</p>
                    <p className="text-white">{selectedReport.description}</p>
                  </div>
                )}
                {selectedReport.appealReason && (
                  <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10">
                    <p className="text-sm text-blue-300 font-medium mb-1">Appeal Reason</p>
                    <p className="text-blue-200">{selectedReport.appealReason}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                {selectedReport.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleReview(selectedReport._id, 'removed', 'resolved')}
                      className="flex-1 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md text-red-300 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove Content
                    </button>
                    <button
                      onClick={() => handleReview(selectedReport._id, 'kept', 'dismissed')}
                      className="flex-1 px-4 py-2 rounded-xl border border-green-500/30 bg-green-500/10 backdrop-blur-md text-green-300 hover:bg-green-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Dismiss
                    </button>
                  </>
                )}
                {selectedReport.status === 'appealed' && (
                  <>
                    <button
                      onClick={() => handleReview(selectedReport._id, 'kept', 'dismissed')}
                      className="flex-1 px-4 py-2 rounded-xl border border-green-500/30 bg-green-500/10 backdrop-blur-md text-green-300 hover:bg-green-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve Appeal
                    </button>
                    <button
                      onClick={() => handleReview(selectedReport._id, 'removed', 'resolved')}
                      className="flex-1 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md text-red-300 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject Appeal
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedReport(null)}
                  className="px-4 py-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
