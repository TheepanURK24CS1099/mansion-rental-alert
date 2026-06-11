import { NextRequest, NextResponse } from 'next/server';

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

  let requestBody: unknown;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      requestBody = await request.json();
    } else {
      requestBody = await request.text();
    }
  } catch (error) {
    requestBody = null;
  }

  console.log({
    event: 'iclock_device_request',
    method,
    pathname,
    searchParams,
    sn,
    requestBody,
    timestamp,
  });

  return new NextResponse('OK', { status: 200 });
}
