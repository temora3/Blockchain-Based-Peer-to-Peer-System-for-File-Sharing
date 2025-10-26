import React, { useState } from 'react';
import WebTorrent from 'webtorrent';

const FileUploader: React.FC = () => {
  const [magnetURI, setMagnetURI] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const client = new WebTorrent();
    client.seed(file, (torrent: any) => {
      setMagnetURI(torrent.magnetURI);
      setSeeding(true);
    });
    client.on('error', (err: any) => {
      setError(err.message);
    });
  };

  return (
    <div className="p-4 border rounded bg-white shadow">
      <h2 className="text-lg font-bold mb-2">Upload & Seed File</h2>
      <input type="file" onChange={handleFileChange} />
      {magnetURI && (
        <div className="mt-2">
          <div className="font-mono text-xs break-all">Magnet URI: {magnetURI}</div>
          <div className="text-green-600 font-semibold">Seeding!</div>
        </div>
      )}
      {error && <div className="text-red-600">Error: {error}</div>}
    </div>
  );
};

export default FileUploader;
