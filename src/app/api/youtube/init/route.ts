import { NextResponse } from "next/server";

const API_BASE = "https://p.savenow.to";
const API_KEY = "dfcb6d76f2f6a9894gjkege8a4ab232222";

const formatMap: Record<string, string> = {
  "144": "144", "240": "240", "360": "360", "480": "480",
  "720": "720", "1080": "1080", "1440": "1440",
  "4k": "4k", "8k": "8k",
  "mp3": "mp3", "m4a": "m4a", "wav": "wav", "flac": "flac",
  "ogg": "ogg", "opus": "opus", "aac": "aac", "webm": "webm",
};

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  try {
    const { url, type, format } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const quality = type === "audio" ? (formatMap[format] || "mp3") : (formatMap[format] || "720");

    const initiateUrl = `${API_BASE}/api/v2/download?format=${quality}&url=${encodeURIComponent(url)}&apikey=${API_KEY}`;
    const [initRes, videoId] = await Promise.all([
      fetch(initiateUrl),
      Promise.resolve(extractVideoId(url)),
    ]);
    const initData = await initRes.json();

    if (!initData.success) {
      return NextResponse.json({ error: "Failed to initiate download" }, { status: 500 });
    }

    let channel: string | null = null;
    let duration: number | null = null;

    if (videoId) {
      try {
        const html = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        }).then((r) => r.text());

        const authorMatch = html.match(/"author":"([^"]+)"/);
        if (authorMatch) channel = authorMatch[1];

        const durMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (durMatch) duration = Number(durMatch[1]);
      } catch {
        try {
          const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`).then((r) => r.json());
          if (oembed.author_name) channel = oembed.author_name;
        } catch {}
      }
    }

    return NextResponse.json({
      id: initData.id,
      progressUrl: initData.progress_url,
      title: initData.title || initData.info?.title,
      thumbnail: initData.thumbnail_url,
      channel,
      duration,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
