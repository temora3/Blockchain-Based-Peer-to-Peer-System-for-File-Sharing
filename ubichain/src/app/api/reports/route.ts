import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export interface Report {
  _id?: string;
  torrentId: string;
  reportedBy: string; // userId
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed' | 'appealed';
  reviewedBy?: string; // admin userId
  reviewedAt?: Date;
  action?: 'removed' | 'kept' | 'warning';
  appealReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { torrentId, reportedBy, reason, description } = body;

    if (!torrentId || !reportedBy || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Check if user already reported this torrent
    const existingReport = await db.collection('reports').findOne({
      torrentId,
      reportedBy,
      status: 'pending',
    });

    if (existingReport) {
      return NextResponse.json({ error: 'You have already reported this torrent' }, { status: 400 });
    }

    const report: Omit<Report, '_id'> = {
      torrentId,
      reportedBy,
      reason,
      description: description || '',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('reports').insertOne(report);
    return NextResponse.json({ success: true, id: result.insertedId }, { status: 201 });
  } catch (error) {
    console.error('Error creating report:', error);
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const torrentId = searchParams.get('torrentId');

    const client = await clientPromise;
    const db = client.db();

    const filter: any = {};
    if (status) filter.status = status;
    if (torrentId) filter.torrentId = torrentId;

    const reports = await db
      .collection('reports')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

