"use client";

interface VideoPlayerProps {
  src: string;
  poster?: string;
}

export function VideoPlayer({ src, poster }: VideoPlayerProps) {
  return (
    <video
      src={src}
      poster={poster}
      controls
      className="w-full max-w-4xl"
    />
  );
}
