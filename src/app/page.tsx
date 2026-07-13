"use client";

import { useState, FormEvent, useEffect, useRef } from "react";

type InitResult = {
  id: string;
  progressUrl: string;
  title: string;
  thumbnail: string;
  channel: string | null;
  duration: number | null;
};

function formatDuration(sec: number): string {
  if (typeof sec !== 'number' || isNaN(sec)) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function fetchDurationFromYT(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await res.text();
    const match = html.match(/"lengthSeconds":"(\d+)"/);
    return match ? parseInt(match[1]) : null;
  } catch {
    return null;
  }
}

type StatusResult = {
  success: boolean;
  progress: number;
  text: string;
  downloadUrl: string | null;
  title: string | null;
};

function BlurFade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, filter: visible ? "blur(0px)" : "blur(6px)", transform: visible ? "translateY(0)" : "translateY(-6px)", transition: `all 0.6s ease-out ${delay}s` }}>
      {children}
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const [format, setFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState(128);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [init, setInit] = useState<InitResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [progress, setProgress] = useState(0);

  const audioFormats = ["mp3", "m4a", "wav", "flac", "ogg", "opus", "aac"];
  const videoQualities = ["360", "480", "720", "1080", "1440", "4k"];

  const API_KEY = "dfcb6d76f2f6a9894gjkege8a4ab232222";
  const formatMap: Record<string, string> = {
    "mp3": "mp3", "m4a": "m4a", "wav": "wav", "flac": "flac",
    "ogg": "ogg", "opus": "opus", "aac": "aac",
    "144": "144", "240": "240", "360": "360", "480": "480",
    "720": "720", "1080": "1080", "1440": "1440",
    "4k": "4k",
  };

  function extractVideoId(videoUrl: string): string | null {
    const m = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url) return;

    if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
      setUrlError("Invalid YouTube URL");
      return;
    }
    setUrlError("");

    setLoading(true);
    setError("");
    setInit(null);
    setStatus(null);

    try {
      const quality = formatMap[format] || (mode === "audio" ? "mp3" : "720");
      const initUrl = `/api/savenow/v2/download?format=${quality}&url=${encodeURIComponent(url)}&apikey=${API_KEY}`;
      const initRes = await fetch(initUrl);
      const initData = await initRes.json();

      if (!initData.success) {
        setError("Failed to process video");
        setLoading(false);
        return;
      }

      let channel: string | null = null;
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        const oembedData = await oembedRes.json();
        channel = oembedData.author_name || null;
      } catch {}
      channel = channel || initData.author || initData.channel || initData.info?.author || null;

      setInit({
        id: initData.id,
        progressUrl: initData.progress_url,
        title: initData.title || initData.info?.title,
        thumbnail: initData.thumbnail_url,
        channel,
        duration: initData.duration || initData.info?.duration || initData.length || initData.info?.length || null,
      });
      setProgress(0);

      const videoId = extractVideoId(url);
      if (videoId) {
        fetchDurationFromYT(videoId).then(d => {
          if (d) setInit(prev => prev?.duration ? prev : { ...prev!, duration: d });
        });
      }

      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/savenow/progress?id=${initData.id}`);
          const statusData = await statusRes.json();
          setStatus({
            success: statusData.success === 1,
            progress: statusData.progress / 10,
            text: statusData.text,
            downloadUrl: statusData.download_url || null,
            title: statusData.title || null,
          });

          const statusDuration = statusData.duration || statusData.info?.duration || statusData.length || statusData.info?.length || null;
          if (statusDuration) {
            setInit(prev => {
              if (!prev || prev.duration) return prev;
              return { ...prev, duration: statusDuration };
            });
          }
          if (statusData.title && !initData.title) {
            setInit(prev => {
              if (!prev || prev.title) return prev;
              return { ...prev, title: statusData.title };
            });
          }

          if (statusData.success === 1 && statusData.download_url) {
            setProgress(100);
            setLoading(false);
            clearInterval(interval);
          }
        } catch {
          setLoading(false);
          clearInterval(interval);
        }
      }, 2000);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!init || status?.success) return;
    const id = setInterval(() => {
      setProgress((p) => Math.min(95, p + (95 - p) * 0.12 + 0.5));
    }, 800);
    return () => clearInterval(id);
  }, [init, status?.success]);

  return (
    <div className="flex min-h-screen justify-center bg-black font-mono pt-24 pb-16 sm:pb-24 sm:px-24">
      <div className="fixed inset-0 pointer-events-none">
        <div className="pointer-events-none absolute inset-0 isolate overflow-hidden rounded-[inherit]">
          <div className="absolute inset-0 overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 20% 15%, color-mix(in srgb, #FF0000 45%, transparent), transparent 70%)" }} />
            <div aria-hidden="true" className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 80% 10%, color-mix(in srgb, #FF0000 35%, transparent), transparent 75%)" }} />
          </div>
        </div>
      </div>
      <div className="fixed inset-0 bg-black/50 pointer-events-none" />

      <div className="relative z-10 w-full flex justify-center my-auto">
        <main className="flex w-full max-w-2xl flex-col gap-8 px-5 sm:px-6">
          <div className="space-y-4">
            <div>
              <BlurFade delay={0.1}>
                <h1 className="text-2xl font-bold tracking-tight text-white">YouTube Downloader</h1>
              </BlurFade>
            </div>
            <BlurFade delay={0.2}>
              <p className="text-white/60 text-sm leading-relaxed max-w-[85%]">
                convert and download youtube videos in any format.
              </p>
            </BlurFade>
          </div>

          <BlurFade delay={0.3}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <input
                  type="text"
                  placeholder="paste a youtube url..."
                  value={url}
                  disabled={loading}
                  onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
                  className={`w-full rounded-lg border bg-white/[0.02] backdrop-blur-sm px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/[0.2] ${urlError ? "border-red-500/50" : "border-white/[0.08]"} ${loading ? "opacity-40 cursor-not-allowed" : ""}`}
                />
                {urlError && <p className="text-red-400 text-[13px] mt-1">{urlError}</p>}
              </div>

              <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-1">
                <button type="button" disabled={loading} onClick={() => { setMode("audio"); setFormat("mp3"); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition ${mode === "audio" ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white/80"} ${loading ? "opacity-40 cursor-not-allowed" : ""}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" className="size-3.5" fill="currentColor"><path d="M532 71C539.6 77.1 544 86.3 544 96L544 400C544 444.2 501 480 448 480C395 480 352 444.2 352 400C352 355.8 395 320 448 320C459.2 320 470 321.6 480 324.6L480 207.9L256 257.7L256 464C256 508.2 213 544 160 544C107 544 64 508.2 64 464C64 419.8 107 384 160 384C171.2 384 182 385.6 192 388.6L192 160C192 145 202.4 132 217.1 128.8L505.1 64.8C514.6 62.7 524.5 65 532.1 71.1z"/></svg>
                  Audio
                </button>
                <button type="button" disabled={loading} onClick={() => { setMode("video"); setFormat("720"); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition ${mode === "video" ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white/80"} ${loading ? "opacity-40 cursor-not-allowed" : ""}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" className="size-3.5" fill="currentColor"><path d="M128 128C92.7 128 64 156.7 64 192L64 448C64 483.3 92.7 512 128 512L384 512C419.3 512 448 483.3 448 448L448 192C448 156.7 419.3 128 384 128L128 128zM496 400L569.5 458.8C573.7 462.2 578.9 464 584.3 464C597.4 464 608 453.4 608 440.3L608 199.7C608 186.6 597.4 176 584.3 176C578.9 176 573.7 177.8 569.5 181.2L496 240L496 400z"/></svg>
                  Video
                </button>
              </div>

              {mode === "audio" ? (
                <div className="flex flex-wrap gap-2">
                  {audioFormats.map((f) => (
                    <button type="button" key={f} disabled={loading} onClick={() => setFormat(f)}
                      className={`rounded-md border px-3 py-1.5 text-xs uppercase transition ${format === f ? "border-white/20 bg-white/[0.08] text-white" : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:border-white/[0.15] hover:text-white/80"} ${loading ? "opacity-40 cursor-not-allowed" : ""}`}>{f}</button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {videoQualities.map((q) => (
                    <button type="button" key={q} disabled={loading} onClick={() => setFormat(q)}
                      className={`rounded-md border px-3 py-1.5 text-xs uppercase transition ${format === q ? "border-white/20 bg-white/[0.08] text-white" : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:border-white/[0.15] hover:text-white/80"} ${loading ? "opacity-40 cursor-not-allowed" : ""}`}>{q === "4k" ? "4K" : `${q}p`}</button>
                  ))}
                </div>
              )}

              {mode === "audio" && format === "mp3" && (
                <div className={`flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm px-3 py-2.5 ${loading ? "opacity-40" : ""}`}>
                  <span className="text-[10px] text-white/40 w-6">64</span>
                  <input type="range" min={64} max={320} step={64} disabled={loading} value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))} className="flex-1 accent-white/60" />
                  <span className="text-[10px] text-white/40 w-6 text-right">320</span>
                  <span className="text-xs text-white/70 font-medium w-16 text-right tabular-nums">{bitrate} kbps</span>
                </div>
              )}

              <button type="submit" disabled={!url || loading}
                className="w-full rounded-lg bg-white py-3 text-sm font-bold text-black transition hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? "Converting..." : "Convert"}
              </button>
            </form>
          </BlurFade>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {init && (
            <BlurFade delay={0.4}>
              <div className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.01] backdrop-blur-xl p-4">
                <div className="flex gap-4">
                  {init.thumbnail && (
                    <img src={init.thumbnail} alt="" className="w-28 h-16 rounded object-cover flex-shrink-0 border border-white/[0.08]" />
                  )}
                  <div className="flex flex-col justify-center min-w-0">
                    <p className="text-white text-sm font-medium truncate">{init.title}</p>
                    <p className="text-white/40 text-xs truncate mt-0.5">
                      {init.channel && <span>{init.channel}</span>}
                      {init.channel && init.duration != null && <span className="mx-1.5 text-base">·</span>}
                      {init.duration != null && <span>{formatDuration(init.duration)}</span>}
                    </p>
                  </div>
                </div>

                {!status?.success && (
                  <>
                    <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden">
                      <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-white/40 flex items-center justify-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-3.5 animate-spin" fill="currentColor"><path d="M208 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm0 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM48 208a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm368 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM75 369.1A48 48 0 1 1 142.9 437 48 48 0 1 1 75 369.1zM75 75A48 48 0 1 1 142.9 142.9 48 48 0 1 1 75 75zM437 369.1A48 48 0 1 1 369.1 437 48 48 0 1 1 437 369.1z"/></svg>
                      <span>{Math.round(progress)}%</span>
                      <span className="text-white/30">—</span>
                      <span className="uppercase">processing</span>
                    </p>
                  </>
                )}

                {status?.success && status.downloadUrl && (
                  <a href={status.downloadUrl} download={`${(init.title || 'video').replace(/[<>:"\/\\|?*]/g, '_')}.${mode === 'audio' ? format : 'mp4'}`}
                    className="flex items-center justify-center gap-2 w-full rounded-lg bg-white py-2.5 text-sm font-bold text-black transition hover:bg-white/90">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="size-4" fill="currentColor"><path d="M256 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 210.7-41.4-41.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c12.5 12.5 32.8 12.5 45.3 0l96-96c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 242.7 256 32zM64 320c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-46.9 0-56.6 56.6c-31.2 31.2-81.9 31.2-113.1 0L110.9 320 64 320zm304 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>
                    Download
                  </a>
                )}
              </div>
            </BlurFade>
          )}
        </main>
      </div>
    </div>
  );
}
