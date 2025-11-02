import express from 'express';
import cors from 'cors';
import { Server as TrackerServer } from 'bittorrent-tracker';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory points per peerId with detailed stats
const peerStats = new Map();

// Tracker server (HTTP + WebSocket)
const tracker = new TrackerServer({
  udp: false,
  http: true,
  ws: true
});

tracker.on('warning', err => console.warn('tracker warning', err?.message || err));
tracker.on('error', err => console.error('tracker error', err));

tracker.on('update', (addr, params) => {
  // params: { info_hash, peer_id, left, uploaded, downloaded }
  try {
    const pid = params.peer_id?.toString?.('utf8') || String(params.peer_id);
    const uploaded = Number(params.uploaded || 0);
    const downloaded = Number(params.downloaded || 0);
    const left = Number(params.left || 0);
    
    if (!peerStats.has(pid)) {
      peerStats.set(pid, { uploaded: 0, downloaded: 0, seedingTime: 0, lastUpdate: Date.now() });
    }
    
    const stats = peerStats.get(pid);
    
    // Only credit for NEW bytes uploaded (not cumulative)
    if (uploaded > stats.uploaded) {
      const newUploaded = uploaded - stats.uploaded;
      stats.uploaded = uploaded;
      // Points = uploaded bytes / 1024
      stats.points = (stats.points || 0) + (newUploaded / 1024);
    }
    
    stats.downloaded = downloaded;
    stats.lastUpdate = Date.now();
    
    // Bonus for fully seeding (left === 0)
    if (left === 0 && !stats.seedingBonus) {
      stats.points = (stats.points || 0) + 10;
      stats.seedingBonus = true;
    }
    
    peerStats.set(pid, stats);
  } catch (err) {
    console.error('Update error:', err);
  }
});

// REST API to fetch points and stats by peerId
app.get('/points/:peerId', (req, res) => {
  const { peerId } = req.params;
  const stats = peerStats.get(peerId) || { points: 0, uploaded: 0, downloaded: 0, seedingBonus: false };
  res.json({ 
    peerId, 
    points: Math.round(stats.points || 0),
    uploaded: stats.uploaded,
    downloaded: stats.downloaded,
    seedingBonus: stats.seedingBonus || false
  });
});

// Debug endpoint to list all peers
app.get('/peers', (req, res) => {
  const peers = Array.from(peerStats.entries()).map(([pid, stats]) => ({
    peerId: pid,
    points: Math.round(stats.points || 0),
    uploaded: stats.uploaded,
    downloaded: stats.downloaded,
    seedingBonus: stats.seedingBonus || false
  }));
  res.json({ peers, total: peers.length });
});

// Mount tracker on /announce
const httpServer = app.listen(4000, () => {
  console.log('Scoring server on http://localhost:4000');
  console.log('Tracker announce URL ws://localhost:4000');
});

tracker.listen(httpServer, { trustProxy: true }, () => {
  console.log('Tracker listening on /announce');
});


