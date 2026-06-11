import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const progressUrl = req.nextUrl.searchParams.get("progressUrl");

    if (!progressUrl) {
      return NextResponse.json({ error: "progressUrl is required" }, { status: 400 });
    }

    const res = await fetch(progressUrl);
    const data = await res.json();

    return NextResponse.json({
      success: data.success === 1,
      progress: data.progress / 10,
      text: data.text,
      downloadUrl: data.download_url || null,
      title: data.title || null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to check progress" }, { status: 500 });
  }
}
