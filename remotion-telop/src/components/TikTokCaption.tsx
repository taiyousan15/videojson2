/**
 * TikTokCaption.tsx - TikTok風ワードハイライト字幕
 *
 * @remotion/captions を使用した高度な字幕表示
 * - ワード単位のハイライト
 * - 読み上げに同期したアニメーション
 * - カラオケ風表示
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { JapaneseFonts } from "../fonts/japanese-fonts";

// キャプションの単語データ
export interface CaptionWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

// キャプションセグメント
export interface CaptionSegment {
  words: CaptionWord[];
  startFrame: number;
  endFrame: number;
}

export interface TikTokCaptionProps {
  segments: CaptionSegment[];
  fontSize?: number;
  fontFamily?: keyof typeof JapaneseFonts;
  activeColor?: string;
  inactiveColor?: string;
  backgroundColor?: string;
  position?: "top" | "center" | "bottom";
}

export const TikTokCaption: React.FC<TikTokCaptionProps> = ({
  segments,
  fontSize = 56,
  fontFamily = "mPlusRounded",
  activeColor = "#FFFF00",
  inactiveColor = "#FFFFFF",
  backgroundColor = "rgba(0, 0, 0, 0.5)",
  position = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // 現在のセグメントを取得
  const currentSegment = segments.find(
    (seg) => frame >= seg.startFrame && frame <= seg.endFrame
  );

  if (!currentSegment) {
    return null;
  }

  const fontFamilyName = JapaneseFonts[fontFamily];

  // 位置計算
  const getPositionStyle = (): React.CSSProperties => {
    switch (position) {
      case "top":
        return { top: "15%" };
      case "center":
        return { top: "50%", transform: "translateY(-50%)" };
      case "bottom":
      default:
        return { bottom: "15%" };
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 5%",
        ...getPositionStyle(),
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "8px",
          backgroundColor,
          padding: "16px 32px",
          borderRadius: "12px",
          maxWidth: width * 0.85,
        }}
      >
        {currentSegment.words.map((word, index) => {
          const isActive = frame >= word.startFrame;
          const isCurrentWord =
            frame >= word.startFrame && frame <= word.endFrame;

          // ポップアニメーション
          const scale = isCurrentWord
            ? spring({
                frame: frame - word.startFrame,
                fps,
                config: {
                  damping: 15,
                  mass: 0.3,
                  stiffness: 300,
                },
              })
            : isActive
            ? 1
            : 0.9;

          return (
            <span
              key={index}
              style={{
                fontFamily: fontFamilyName,
                fontSize: isCurrentWord ? fontSize * 1.1 : fontSize,
                fontWeight: 700,
                color: isActive ? activeColor : inactiveColor,
                transform: `scale(${scale})`,
                transition: "color 0.1s ease",
                textShadow: `
                  3px 3px 0 #000,
                  -3px 3px 0 #000,
                  3px -3px 0 #000,
                  -3px -3px 0 #000
                `,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/**
 * シンプルなテキストからCaptionSegmentを生成するヘルパー
 */
export function createCaptionSegments(
  text: string,
  startFrame: number,
  fps: number,
  wordsPerSecond: number = 3
): CaptionSegment {
  // 日本語テキストを単語に分割（スペースまたは自然な区切り）
  const words = text.split(/\s+|(?<=。)|(?<=、)|(?<=！)|(?<=？)/g).filter(Boolean);

  const framesPerWord = Math.floor(fps / wordsPerSecond);
  const captionWords: CaptionWord[] = words.map((word, index) => ({
    text: word,
    startFrame: startFrame + index * framesPerWord,
    endFrame: startFrame + (index + 1) * framesPerWord - 1,
  }));

  return {
    words: captionWords,
    startFrame,
    endFrame: startFrame + words.length * framesPerWord,
  };
}

export default TikTokCaption;
