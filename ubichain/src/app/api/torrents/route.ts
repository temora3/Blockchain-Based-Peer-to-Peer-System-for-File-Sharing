import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, magnetURI, torrentFileUrl, userId } = body;
  if (!name || !magnetURI || !torrentFileUrl || !userId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  try {
    const client = await clientPromise;
    const db = client.db();
    const result = await db.collection('torrents').insertOne({
      name,
      magnetURI,
      torrentFileUrl,
      userId,
      createdAt: new Date(),
    });
    return NextResponse.json({ success: true, id: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save torrent' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const includeRemoved = searchParams.get('includeRemoved') === 'true';
  try {
    const client = await clientPromise;
    const db = client.db();
    const filter: any = userId ? { userId } : {};
    if (!includeRemoved) {
      filter.removed = { $ne: true };
    }
    const torrents = await db.collection('torrents').find(filter).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ torrents });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch torrents' }, { status: 500 });
  }
}
