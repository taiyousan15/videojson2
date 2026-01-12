/**
 * Telop.tsx - 日本語テロップコンポーネント
 *
 * 機能:
 * - 日本語フォント対応
 * - フェードイン/アウトアニメーション
 * - TikTok風ワードハイライト
 * - 自動フィット（fitText）
 * - 複数スタイルプリセット
 */

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Easing,
} from "remotion";
import { fitText } from "@remotion/layout-utils";
import { JapaneseFonts } from "../fonts/japanese-fonts";

// テロップスタイルプリセット
export type TelopStyle =
  | "default"      // 標準（白文字、黒縁取り）
  | "subtitle"     // 字幕風（下部、半透明背景）
  | "tiktok"       // TikTok風（ワードポップ）
  | "news"         // ニュース風（テロップバー）
  | "variety"      // バラエティ風（カラフル、影付き）
  | "lecture";     // 講義風（シンプル、読みやすい）

// テロップのプロパティ
export interface TelopProps {
  text: string;
  style?: TelopStyle;
  fontSize?: number;
  fontFamily?: keyof typeof JapaneseFonts;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  position?: "top" | "center" | "bottom";
  animation?: "fade" | "slide" | "pop" | "typewriter" | "none";
  animationDuration?: number; // フレーム数
  maxWidth?: number;
  autoFit?: boolean;
}

// スタイルプリセット定義
const stylePresets: Record<TelopStyle, Partial<TelopProps>> = {
  default: {
    fontSize: 48,
    fontFamily: "notoSansJP",
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 3,
    position: "bottom",
    animation: "fade",
  },
  subtitle: {
    fontSize: 36,
    fontFamily: "notoSansJP",
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    position: "bottom",
    animation: "fade",
  },
  tiktok: {
    fontSize: 64,
    fontFamily: "mPlusRounded",
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 4,
    position: "center",
    animation: "pop",
  },
  news: {
    fontSize: 32,
    fontFamily: "notoSansJP",
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 0, 150, 0.9)",
    position: "bottom",
    animation: "slide",
  },
  variety: {
    fontSize: 56,
    fontFamily: "mPlusRounded",
    color: "#FFFF00",
    strokeColor: "#FF0000",
    strokeWidth: 5,
    position: "center",
    animation: "pop",
  },
  lecture: {
    fontSize: 42,
    fontFamily: "notoSansJP",
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    position: "bottom",
    animation: "fade",
    autoFit: true,
  },
};

export const Telop: React.FC<TelopProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // スタイルプリセットとプロパティをマージ
  const preset = stylePresets[props.style || "default"];
  const config = { ...preset, ...props };

  const {
    text,
    fontSize = 48,
    fontFamily = "notoSansJP",
    color = "#FFFFFF",
    strokeColor,
    strokeWidth = 0,
    backgroundColor,
    position = "bottom",
    animation = "fade",
    animationDuration = 15,
    maxWidth = width * 0.9,
    autoFit = false,
  } = config;

  // フォントファミリー名を取得
  const fontFamilyName = JapaneseFonts[fontFamily];

  // 自動フィット
  let finalFontSize = fontSize;
  if (autoFit) {
    const fitted = fitText({
      text,
      withinWidth: maxWidth,
      fontFamily: fontFamilyName,
      fontWeight: "700",
    });
    finalFontSize = Math.min(fontSize, fitted.fontSize);
  }

  // アニメーション計算
  const getAnimationStyle = () => {
    const progress = Math.min(frame / animationDuration, 1);
    const exitStart = durationInFrames - animationDuration;
    const exitProgress = frame > exitStart
      ? Math.min((frame - exitStart) / animationDuration, 1)
      : 0;

    switch (animation) {
      case "fade":
        return {
          opacity: interpolate(
            frame,
            [0, animationDuration, exitStart, durationInFrames],
            [0, 1, 1, 0],
            { extrapolateRight: "clamp" }
          ),
        };

      case "slide":
        const slideIn = interpolate(
          frame,
          [0, animationDuration],
          [-100, 0],
          { extrapolateRight: "clamp" }
        );
        const slideOut = interpolate(
          frame,
          [exitStart, durationInFrames],
          [0, 100],
          { extrapolateLeft: "clamp" }
        );
        return {
          transform: `translateX(${frame < exitStart ? slideIn : slideOut}%)`,
          opacity: frame < exitStart ? 1 : 1 - exitProgress,
        };

      case "pop":
        const scale = spring({
          frame,
          fps,
          config: {
            damping: 12,
            mass: 0.5,
            stiffness: 200,
          },
        });
        return {
          transform: `scale(${scale})`,
          opacity: 1 - exitProgress,
        };

      case "typewriter":
        const visibleChars = Math.floor(
          interpolate(frame, [0, animationDuration * 2], [0, text.length], {
            extrapolateRight: "clamp",
          })
        );
        return {
          opacity: 1 - exitProgress,
          clipPath: `inset(0 ${100 - (visibleChars / text.length) * 100}% 0 0)`,
        };

      default:
        return { opacity: 1 };
    }
  };

  // 位置計算
  const getPositionStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      padding: "0 5%",
    };

    switch (position) {
      case "top":
        return { ...baseStyle, top: "10%" };
      case "center":
        return { ...baseStyle, top: "50%", transform: "translateY(-50%)" };
      case "bottom":
      default:
        return { ...baseStyle, bottom: "10%" };
    }
  };

  // テキストスタイル
  const textStyle: React.CSSProperties = {
    fontFamily: fontFamilyName,
    fontSize: finalFontSize,
    fontWeight: 700,
    color,
    textAlign: "center",
    lineHeight: 1.4,
    maxWidth,
    wordBreak: "keep-all",
    overflowWrap: "break-word",
    // 縁取り（テキストシャドウで実現）
    ...(strokeColor && strokeWidth > 0
      ? {
          textShadow: `
            ${strokeWidth}px ${strokeWidth}px 0 ${strokeColor},
            -${strokeWidth}px ${strokeWidth}px 0 ${strokeColor},
            ${strokeWidth}px -${strokeWidth}px 0 ${strokeColor},
            -${strokeWidth}px -${strokeWidth}px 0 ${strokeColor},
            ${strokeWidth}px 0 0 ${strokeColor},
            -${strokeWidth}px 0 0 ${strokeColor},
            0 ${strokeWidth}px 0 ${strokeColor},
            0 -${strokeWidth}px 0 ${strokeColor}
          `,
        }
      : {}),
    // 背景
    ...(backgroundColor
      ? {
          backgroundColor,
          padding: "12px 24px",
          borderRadius: "8px",
        }
      : {}),
  };

  return (
    <div
      style={{
        position: "absolute",
        ...getPositionStyle(),
        ...getAnimationStyle(),
      }}
    >
      <span style={textStyle}>{text}</span>
    </div>
  );
};

export default Telop;
