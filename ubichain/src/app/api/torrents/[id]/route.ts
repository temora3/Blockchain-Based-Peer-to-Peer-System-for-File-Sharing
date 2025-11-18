import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Try to delete with ObjectId first, fallback to string
    let result;
    try {
      result = await db.collection('torrents').deleteOne({ _id: new ObjectId(params.id) });
    } catch {
      result = await db.collection('torrents').deleteOne({ _id: params.id });
    }
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Torrent not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting torrent:', error);
    return NextResponse.json({ error: 'Failed to delete torrent' }, { status: 500 });
  }
}

