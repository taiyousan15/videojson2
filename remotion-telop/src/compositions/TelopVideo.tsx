/**
 * TelopVideo.tsx - メインコンポジション
 *
 * テロップ付き動画を生成するメインコンポジション
 */

import React from "react";
import { AbsoluteFill, Sequence, staticFile, Img, Audio } from "remotion";
import { Telop, TelopStyle } from "../components/Telop";
import { TikTokCaption, CaptionSegment } from "../components/TikTokCaption";
import { AnimatedText, AnimationType } from "../components/AnimatedText";

// セグメントデータの型
export interface VideoSegment {
  id: string;
  startFrame: number;
  durationInFrames: number;
  backgroundImage?: string;
  backgroundColor?: string;
  telop?: {
    text: string;
    style?: TelopStyle;
    position?: "top" | "center" | "bottom";
    animation?: "fade" | "slide" | "pop" | "typewriter" | "none";
  };
  animatedText?: {
    text: string;
    animationType?: AnimationType;
    position?: "top" | "center" | "bottom";
  };
  captions?: CaptionSegment[];
  audioSrc?: string;
}

export interface TelopVideoProps {
  segments: VideoSegment[];
  width?: number;
  height?: number;
}

export const TelopVideo: React.FC<TelopVideoProps> = ({
  segments,
  width = 1920,
  height = 1080,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {segments.map((segment, index) => (
        <Sequence
          key={segment.id}
          from={segment.startFrame}
          durationInFrames={segment.durationInFrames}
        >
          {/* 背景 */}
          <AbsoluteFill>
            {segment.backgroundImage ? (
              <Img
                src={staticFile(segment.backgroundImage)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: segment.backgroundColor || "#1a1a2e",
                }}
              />
            )}
          </AbsoluteFill>

          {/* テロップ */}
          {segment.telop && (
            <Telop
              text={segment.telop.text}
              style={segment.telop.style || "lecture"}
              position={segment.telop.position || "bottom"}
              animation={segment.telop.animation || "fade"}
              autoFit
            />
          )}

          {/* アニメーションテキスト */}
          {segment.animatedText && (
            <AbsoluteFill
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems:
                  segment.animatedText.position === "top"
                    ? "flex-start"
                    : segment.animatedText.position === "bottom"
                    ? "flex-end"
                    : "center",
                padding: "10%",
              }}
            >
              <AnimatedText
                text={segment.animatedText.text}
                animationType={segment.animatedText.animationType || "fadeUp"}
                animationUnit="character"
                fontSize={56}
                color="#FFFFFF"
                strokeColor="#000000"
                strokeWidth={3}
              />
            </AbsoluteFill>
          )}

          {/* TikTok風キャプション */}
          {segment.captions && segment.captions.length > 0 && (
            <TikTokCaption
              segments={segment.captions}
              fontSize={48}
              activeColor="#FFFF00"
              inactiveColor="#FFFFFF"
              position="center"
            />
          )}

          {/* 音声 */}
          {segment.audioSrc && <Audio src={staticFile(segment.audioSrc)} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export default TelopVideo;
