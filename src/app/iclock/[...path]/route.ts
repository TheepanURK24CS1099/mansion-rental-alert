import { NextRequest, NextResponse } from 'next/server';
import { processDeviceScan } from '@/lib/deviceScanProcessor';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathname = `/${resolvedParams.path.join('/')}`;
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const sn = request.nextUrl.searchParams.get('SN');
  const method = request.method;
  const timestamp = new Date().toISOString();

  console.log({
    event: 'iclock_device_request',
    method,
    pathname,
    searchParams,
    sn,
    timestamp,
  });

  return new NextResponse('OK', { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathname = `/${resolvedParams.path.join('/')}`;
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const sn = request.nextUrl.searchParams.get('SN');
  const method = request.method;
  const timestamp = new Date().toISOString();
  // Read raw body as text for potential ATTLOG processing
  let rawBody: string | null = null;
  try {
    rawBody = await request.text();
  } catch (err) {
    rawBody = null;
  }

  console.log({
    event: 'iclock_device_request',
    method,
    pathname,
    searchParams,
    sn,
    timestamp,
  });

  // If this is an ATTLOG upload from a real device, parse and process scans
  const tableParam = request.nextUrl.searchParams.get('table');
  if (method === 'POST' && tableParam === 'ATTLOG' && rawBody) {
    const lines = rawBody.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      try {
        const cols = line.split('\t');
        const deviceUserId = parseInt(cols[0], 10);
        const scanTimeRaw = cols[1];

        if (Number.isNaN(deviceUserId) || !scanTimeRaw) {
          console.error({
            event: 'iclock_attlog_parse_error',
            line,
            reason: 'invalid_device_user_id_or_scan_time',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        const scanTime = new Date(scanTimeRaw);
        const result = await processDeviceScan({
          deviceUserId,
          scanTime,
          source: 'REAL_DEVICE',
        });

        console.log({
          event: 'iclock_attlog_processed',
          deviceUserId,
          scanTime: scanTime.toISOString(),
          result,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error({
          event: 'iclock_attlog_error',
          line: rawLine,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
      }
    }
  } else {
    // Log the raw body for non-ATTLOG POSTs for debugging
    console.log({
      event: 'iclock_device_request_body',
      rawBody,
      timestamp: new Date().toISOString(),
    });
  }

  return new NextResponse('OK', { status: 200 });
}
