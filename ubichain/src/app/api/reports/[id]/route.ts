import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { status, action, reviewedBy, appealReason } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (reviewedBy) {
      updateData.reviewedBy = reviewedBy;
      updateData.reviewedAt = new Date();
    }

    if (action) {
      updateData.action = action;
    }

    if (appealReason) {
      updateData.appealReason = appealReason;
      updateData.status = 'appealed';
    }

    // Handle torrent removal
    if (action === 'removed') {
      const report = await db.collection('reports').findOne({ _id: new ObjectId(params.id) });
      if (report) {
        // Mark torrent as removed
        await db.collection('torrents').updateOne(
          { _id: new ObjectId(report.torrentId) },
          { $set: { removed: true, removedAt: new Date(), removedBy: reviewedBy } }
        );
      }
    }

    // Handle torrent restoration (if appealed and approved)
    if (status === 'dismissed' && action === 'kept') {
      const report = await db.collection('reports').findOne({ _id: new ObjectId(params.id) });
      if (report) {
        await db.collection('torrents').updateOne(
          { _id: new ObjectId(report.torrentId) },
          { $unset: { removed: '', removedAt: '', removedBy: '' } }
        );
      }
    }

    const result = await db.collection('reports').updateOne(
      { _id: new ObjectId(params.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await clientPromise;
    const db = client.db();

    const result = await db.collection('reports').deleteOne({ _id: new ObjectId(params.id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}

