/**
 * Root.tsx - Remotion エントリーポイント
 */

import React from "react";
import { Composition } from "remotion";
import { TelopVideo, VideoSegment } from "./compositions/TelopVideo";
import { preloadJapaneseFonts } from "./fonts/japanese-fonts";
import { createCaptionSegments } from "./components/TikTokCaption";

// フォントを事前読み込み
preloadJapaneseFonts();

// デモ用セグメントデータ
const demoSegments: VideoSegment[] = [
  {
    id: "intro",
    startFrame: 0,
    durationInFrames: 90,
    backgroundColor: "#1a1a2e",
    animatedText: {
      text: "日本語テロップデモ",
      animationType: "bounceIn",
      position: "center",
    },
  },
  {
    id: "lecture-1",
    startFrame: 90,
    durationInFrames: 150,
    backgroundColor: "#2d3436",
    telop: {
      text: "これは講義風のテロップです。自動でサイズが調整されます。",
      style: "lecture",
      position: "bottom",
      animation: "fade",
    },
  },
  {
    id: "tiktok-style",
    startFrame: 240,
    durationInFrames: 150,
    backgroundColor: "#0984e3",
    telop: {
      text: "TikTok風のポップなテロップ！",
      style: "tiktok",
      position: "center",
      animation: "pop",
    },
  },
  {
    id: "variety",
    startFrame: 390,
    durationInFrames: 120,
    backgroundColor: "#e17055",
    telop: {
      text: "バラエティ番組風！",
      style: "variety",
      position: "center",
      animation: "pop",
    },
  },
  {
    id: "news",
    startFrame: 510,
    durationInFrames: 120,
    backgroundColor: "#636e72",
    telop: {
      text: "ニュース速報：日本語テロップが完成しました",
      style: "news",
      position: "bottom",
      animation: "slide",
    },
  },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* メインのテロップ動画 */}
      <Composition
        id="TelopVideo"
        component={TelopVideo}
        durationInFrames={630}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          segments: demoSegments,
        }}
      />

      {/* 講義スタイル専用 */}
      <Composition
        id="LectureVideo"
        component={TelopVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          segments: [
            {
              id: "lecture",
              startFrame: 0,
              durationInFrames: 300,
              backgroundColor: "#1a1a2e",
              telop: {
                text: "企業研修用の講義テロップです。読みやすさを重視したデザインになっています。",
                style: "lecture",
                position: "bottom",
                animation: "fade",
              },
            },
          ],
        }}
      />
    </>
  );
};
