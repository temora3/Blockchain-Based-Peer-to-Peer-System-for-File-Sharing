import express from 'express';
import cors from 'cors';
import { Server as TrackerServer } from 'bittorrent-tracker';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory points per peerId
const peerPoints = new Map();

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
    // Simple scoring: points += uploadedKB - downloadedKB + seedingBonus
    const prev = peerPoints.get(pid) || 0;
    const delta = Math.max(0, uploaded / 1024) - Math.max(0, downloaded / 1024) + (left === 0 ? 5 : 0);
    peerPoints.set(pid, prev + delta);
  } catch {}
});

// REST API to fetch points by peerId
app.get('/points/:peerId', (req, res) => {
  const { peerId } = req.params;
  const points = peerPoints.get(peerId) || 0;
  res.json({ peerId, points });
});

// Mount tracker on /announce
const httpServer = app.listen(4000, () => {
  console.log('Scoring server on http://localhost:4000');
  console.log('Tracker announce URL ws://localhost:4000');
});

tracker.listen(httpServer, { trustProxy: true }, () => {
  console.log('Tracker listening on /announce');
});


