/**
 * AnimatedText.tsx - 高度なテキストアニメーション
 *
 * 機能:
 * - 文字単位アニメーション
 * - 行単位アニメーション
 * - 複数のエフェクト（フェード、スライド、回転、スケール）
 * - バラエティ番組風のダイナミックなエフェクト
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import { JapaneseFonts } from "../fonts/japanese-fonts";

// アニメーションタイプ
export type AnimationType =
  | "fadeIn"
  | "fadeUp"
  | "fadeDown"
  | "slideLeft"
  | "slideRight"
  | "scaleUp"
  | "scaleDown"
  | "rotateIn"
  | "bounceIn"
  | "typewriter"
  | "wave"
  | "shake"
  | "rainbow";

// アニメーション単位
export type AnimationUnit = "character" | "word" | "line" | "all";

export interface AnimatedTextProps {
  text: string;
  animationType?: AnimationType;
  animationUnit?: AnimationUnit;
  fontSize?: number;
  fontFamily?: keyof typeof JapaneseFonts;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  staggerDelay?: number; // 各要素の遅延（フレーム）
  startFrame?: number;
  duration?: number; // アニメーション持続時間（フレーム）
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  animationType = "fadeUp",
  animationUnit = "character",
  fontSize = 48,
  fontFamily = "notoSansJP",
  color = "#FFFFFF",
  strokeColor = "#000000",
  strokeWidth = 2,
  staggerDelay = 2,
  startFrame = 0,
  duration = 20,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fontFamilyName = JapaneseFonts[fontFamily];

  // テキストを分割
  const splitText = (text: string, unit: AnimationUnit): string[] => {
    switch (unit) {
      case "character":
        return text.split("");
      case "word":
        return text.split(/(\s+)/).filter(Boolean);
      case "line":
        return text.split("\n");
      case "all":
      default:
        return [text];
    }
  };

  const elements = splitText(text, animationUnit);

  // アニメーションスタイルを取得
  const getAnimationStyle = (
    index: number,
    element: string
  ): React.CSSProperties => {
    const elementStartFrame = startFrame + index * staggerDelay;
    const relativeFrame = frame - elementStartFrame;

    if (relativeFrame < 0) {
      return { opacity: 0 };
    }

    const progress = Math.min(relativeFrame / duration, 1);

    switch (animationType) {
      case "fadeIn":
        return {
          opacity: interpolate(relativeFrame, [0, duration], [0, 1], {
            extrapolateRight: "clamp",
          }),
        };

      case "fadeUp":
        return {
          opacity: progress,
          transform: `translateY(${interpolate(
            relativeFrame,
            [0, duration],
            [30, 0],
            { extrapolateRight: "clamp" }
          )}px)`,
        };

      case "fadeDown":
        return {
          opacity: progress,
          transform: `translateY(${interpolate(
            relativeFrame,
            [0, duration],
            [-30, 0],
            { extrapolateRight: "clamp" }
          )}px)`,
        };

      case "slideLeft":
        return {
          opacity: 1,
          transform: `translateX(${interpolate(
            relativeFrame,
            [0, duration],
            [100, 0],
            { extrapolateRight: "clamp" }
          )}px)`,
        };

      case "slideRight":
        return {
          opacity: 1,
          transform: `translateX(${interpolate(
            relativeFrame,
            [0, duration],
            [-100, 0],
            { extrapolateRight: "clamp" }
          )}px)`,
        };

      case "scaleUp":
        const scaleUp = spring({
          frame: relativeFrame,
          fps,
          config: { damping: 12, mass: 0.5, stiffness: 200 },
        });
        return {
          opacity: 1,
          transform: `scale(${scaleUp})`,
        };

      case "scaleDown":
        return {
          opacity: progress,
          transform: `scale(${interpolate(
            relativeFrame,
            [0, duration],
            [2, 1],
            { extrapolateRight: "clamp" }
          )})`,
        };

      case "rotateIn":
        return {
          opacity: progress,
          transform: `rotate(${interpolate(
            relativeFrame,
            [0, duration],
            [-180, 0],
            { extrapolateRight: "clamp" }
          )}deg)`,
        };

      case "bounceIn":
        const bounce = spring({
          frame: relativeFrame,
          fps,
          config: { damping: 8, mass: 0.8, stiffness: 300 },
        });
        return {
          opacity: 1,
          transform: `scale(${bounce})`,
        };

      case "typewriter":
        return {
          opacity: relativeFrame >= 0 ? 1 : 0,
        };

      case "wave":
        const waveOffset = Math.sin((frame + index * 10) * 0.1) * 10;
        return {
          opacity: progress,
          transform: `translateY(${waveOffset}px)`,
        };

      case "shake":
        const shakeX = Math.sin(frame * 0.5 + index) * 3;
        const shakeY = Math.cos(frame * 0.5 + index) * 3;
        return {
          opacity: progress,
          transform: `translate(${shakeX}px, ${shakeY}px)`,
        };

      case "rainbow":
        const hue = (index * 30 + frame * 2) % 360;
        return {
          opacity: progress,
          color: `hsl(${hue}, 100%, 50%)`,
        };

      default:
        return { opacity: 1 };
    }
  };

  // 縁取りスタイル
  const strokeStyle =
    strokeColor && strokeWidth > 0
      ? {
          textShadow: `
          ${strokeWidth}px ${strokeWidth}px 0 ${strokeColor},
          -${strokeWidth}px ${strokeWidth}px 0 ${strokeColor},
          ${strokeWidth}px -${strokeWidth}px 0 ${strokeColor},
          -${strokeWidth}px -${strokeWidth}px 0 ${strokeColor}
        `,
        }
      : {};

  return (
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {elements.map((element, index) => (
        <span
          key={index}
          style={{
            display: "inline-block",
            fontFamily: fontFamilyName,
            fontSize,
            fontWeight: 700,
            color,
            whiteSpace: "pre",
            ...strokeStyle,
            ...getAnimationStyle(index, element),
          }}
        >
          {element}
        </span>
      ))}
    </div>
  );
};

export default AnimatedText;
