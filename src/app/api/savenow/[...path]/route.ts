import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.pathname.replace("/api/savenow/", "");
  const search = request.nextUrl.searchParams.toString();
  const url = `https://p.savenow.to/api/${path}${search ? `?${search}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ success: false }, { status: 502 });
  }
}
