/**
 * index.ts - エクスポート
 */

export { Telop, TelopStyle, TelopProps } from "./components/Telop";
export {
  TikTokCaption,
  TikTokCaptionProps,
  CaptionWord,
  CaptionSegment,
  createCaptionSegments,
} from "./components/TikTokCaption";
export {
  AnimatedText,
  AnimatedTextProps,
  AnimationType,
  AnimationUnit,
} from "./components/AnimatedText";
export { TelopVideo, TelopVideoProps, VideoSegment } from "./compositions/TelopVideo";
export { RemotionRoot } from "./Root";
export * from "./fonts/japanese-fonts";

// Remotion エントリーポイント
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
