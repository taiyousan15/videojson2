---
name: videojson_orchestrator
description: VideoJSON の作業フローを統括し、ユーザーの意図に応じて適切なスキルへ誘導する。
triggers:
  - "VideoJSON"
  - "動画制作"
  - "何から始めれば"
  - "フローを教えて"
  - "使い方"
  - "字幕"
  - "ローカル動画"
  - "SRT"
  - "VTT"
inputs:
  - ユーザーの質問/要望
outputs:
  - 適切なスキルへの誘導、または直接の回答
---

# VideoJSON オーケストレーター

このスキルは VideoJSON の「入り口」です。
ユーザーの意図を分類し、適切な専門スキルへ誘導します。

---

## 最重要原則（絶対遵守）

### 【絶対禁止事項】

| 禁止事項 | 理由 |
|----------|------|
| **元動画からの画像・フレームの切り出し・コピー** | ユーザーが明示的に禁止。著作権リスク |
| **元動画のフレームを背景として使用** | 暗くしても、ぼかしても禁止 |
| **元動画の映像を加工して再利用** | いかなる形式での再利用も禁止 |
| プレースホルダー（「[画像]」等）の使用 | 不完全な教材になる |

### 【必須実行事項】

| 必須事項 | 方法 |
|----------|------|
| 映像の新規生成 | **Sora2** または **NanoBanana** で生成 |
| 背景画像の新規生成 | **NanoBanana** で類似イメージを生成 |
| スライド画像の新規作成 | **PIL** でテキスト配置 + **NanoBanana** で画像生成 |

### 【違反時の対応】

上記禁止事項に違反した場合は、**全工程をやり直す**こと。

---

## クイックルート選択

| ユーザーの状況 | 案内するルート |
|---------------|---------------|
| YouTubeリンクがある | **ルート A** |
| SRT/VTT字幕がある | **ルート B** |
| ローカル動画がある | **ルート C** |
| 台本を早く作りたい | **narration:skeleton** |
| 日本語ナレーション動画を作りたい | **ルート D（TTS動画生成）** |
| **高品質・長時間動画・企業納品** | **ルート E（Advanced Mode）** |
| **高品質+高速（40-60%短縮）** | **ルート F（Parallel Advanced Mode）** |

---

## Quick Mode vs Advanced Mode vs Parallel Advanced Mode

| シナリオ | 推奨モード | スキル |
|----------|-----------|--------|
| 短い動画（5分以下）、急ぎ | Quick Mode | スライド.md |
| 長い動画（15分以上）、高品質 | Advanced Mode | advanced_video_analysis |
| キャラクター一貫性が重要 | Advanced Mode | advanced_video_analysis |
| 企業納品・本番用 | Advanced Mode | advanced_video_analysis |
| 初回テスト・プロトタイプ | Quick Mode | スライド.md |
| **高品質+高速（40-60%短縮）** | **Parallel Advanced** | **slide2.md** |
| **大量動画処理** | **Parallel Advanced** | **slide2.md** |

---

## ルート A: YouTube字幕あり

キーワード: 「YouTube」「リンク」「URL」

```bash
# Step 1: YouTube → structure.json
npm run analyze:youtube -- --url "<URL>" --out structure.json

# Step 2: 骨組み生成
npm run narration:skeleton -- --structure structure.json --out narration.md

# Step 3: 台本を編集（エディタで開く）

# Step 4: 動画生成
npm run render:run -- --structure structure.json --narration narration.md --out output.mp4
```

**字幕が取得できない場合**: ルート B または C を案内する。

---

## ルート B: SRT/VTT字幕あり

キーワード: 「SRT」「VTT」「字幕ファイル」「yt-dlp」

```bash
# Step 1: SRT/VTT → transcript.json
npm run transcript:convert -- --in subtitles.srt --out transcript.json --language ja

# Step 2: transcript → structure.json
npm run analyze:transcript -- --transcript transcript.json --out structure.json

# Step 3-4: ルート A と同じ
npm run narration:skeleton -- --structure structure.json --out narration.md
# 台本を編集
npm run render:run -- --structure structure.json --narration narration.md --out output.mp4
```

**字幕の入手方法**:
```bash
# yt-dlp で字幕をダウンロード
yt-dlp --write-auto-sub --sub-lang ja --skip-download "<URL>"
```

---

## ルート C: ローカル動画あり

キーワード: 「ローカル動画」「mp4」「Whisper」「文字起こし」

```bash
# Step 1: 動画 → structure.json（Whisper使用）
npm run analyze:video -- --video video.mp4 --out structure.json --language ja

# Step 2-4: ルート A と同じ
npm run narration:skeleton -- --structure structure.json --out narration.md
# 台本を編集
npm run render:run -- --structure structure.json --narration narration.md --out output.mp4
```

**Whisperがない場合**:
スクリプトがインストール手順を表示します。
```bash
# Python版
pip install openai-whisper

# macOS
brew install whisper-cpp
```

---

## ルート D: 日本語ナレーション動画生成（TTS）

キーワード: 「日本語化」「日本語ナレーション」「TTS」「Neural2」「研修動画」「動画を日本語に」

**詳細は tts_video_generator スキルを参照**

### 前提条件
- Google Cloud プロジェクト設定済み
- Text-to-Speech API 有効化済み

### GCP未設定の場合
```bash
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
gcloud services enable texttospeech.googleapis.com
```

### 基本フロー
1. sections_data.json 作成（セクション定義 + ナレーション）
2. Sora2 映像生成（FAL API）
3. **Google Cloud TTS Neural2 で日本語音声生成**（必須）
4. FFmpeg で合成（`-map 0:v -map 1:a` で音声を明示指定）
5. 全セクション結合

### 重要ポイント
- **日本語音声は必ず Neural2 を使用**（ElevenLabs等は日本語品質が低い）
- **推奨音声**: ja-JP-Neural2-D（男性・明るい・研修向け）
- **FFmpeg合成時は `-map` 必須**（Sora2の元音声を除外するため）

### コスト目安
- Sora2 映像: 約 $7.26（72秒の場合）
- Google TTS: 無料枠内（月100万文字まで）
- **合計: 約1,100円/動画**

---

## 台本を早く作りたい

キーワード: 「台本」「narration」「スクリプト」「ナレーション」

### 骨組み生成（手動編集用）

```bash
npm run narration:skeleton -- --structure structure.json --out narration.md
```

### AI自動生成（APIキー必要）

```bash
# OpenAI
OPENAI_API_KEY=xxx npm run narration:generate -- --structure structure.json --out narration.md

# Anthropic
ANTHROPIC_API_KEY=xxx npm run narration:generate -- --structure structure.json --out narration.md --provider anthropic
```

---

## 動画を生成したい

キーワード: 「mp4」「動画生成」「レンダリング」「render:run」

```bash
npm run render:run -- \
  --structure structure.json \
  --narration narration.md \
  --out output.mp4
```

このコマンドは以下を自動実行:
1. narration.md と structure.json の整合性チェック
2. render.json の自動生成
3. アセットの解決とマテリアライズ
4. ffmpeg でのmp4レンダリング

---

## テロップ設定（Remotion推奨）

キーワード: 「テロップ」「字幕」「Remotion」「視認性」

### Remotionを使用する理由
- FFmpeg ASS字幕より柔軟なデザイン
- アニメーション対応
- React コンポーネントで管理可能

### 推奨テロップスタイル

```typescript
// remotion/components/Telop.tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

export const Telop = ({
  text,
  subtitle
}: {
  text: string;
  subtitle?: string
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 60 }}>
      {/* メインタイトル */}
      <div style={{
        fontSize: 72,              // 大きめフォント
        fontWeight: 'bold',
        color: '#FFFFFF',
        textShadow: `
          3px 3px 6px rgba(0,0,0,0.8),
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000
        `,                         // 視認性向上のための縁取り
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: '16px 32px',
        borderRadius: 8,
        opacity,
      }}>
        {text}
      </div>

      {/* サブタイトル */}
      {subtitle && (
        <div style={{
          fontSize: 42,            // サブは少し小さめ
          color: '#F0F0F0',
          textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
          marginTop: 12,
          opacity,
        }}>
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
```

### テロップ設定値（推奨）

| 項目 | 推奨値 | 説明 |
|------|--------|------|
| メインフォントサイズ | 72px | 1080p動画用、大きく見やすい |
| サブフォントサイズ | 42px | メインの60%程度 |
| 文字色 | #FFFFFF | 白（どの背景でも見やすい） |
| 縁取り | 黒 3px + shadow | 視認性確保 |
| 背景 | rgba(0,0,0,0.6) | 半透明黒帯 |
| パディング | 16px 32px | 余白で読みやすく |
| 位置 | 画面下部 60px | 映像を邪魔しない |

### Remotion セットアップ

```bash
# インストール
npm install remotion @remotion/cli @remotion/renderer

# プロジェクト初期化（未設定の場合）
npx remotion init
```

### 使用例（sections_data.json）

```json
{
  "telop": {
    "main_title": "AI画像生成入門",
    "subtitle": "プロンプトエンジニアリングの基礎",
    "style": "remotion",
    "fontSize": 72,
    "position": "bottom"
  }
}
```

---

## Sora2 映像生成設定

キーワード: 「Sora2」「映像生成」「FAL API」「ブラウザ」

### 方法1: FAL API（推奨・自動化向け）
```bash
# .env に設定
FAL_API_KEY=your_api_key
```

### 方法2: ブラウザ経由（手動・無料枠利用）
1. https://sora.chatgpt.com にログイン
2. プロンプトを入力して生成
3. 生成した動画をダウンロード
4. `video/` フォルダに配置

### Sora2 プロンプトのポイント
- 英語で記述（日本語より精度が高い）
- 具体的なシーン描写
- カメラワーク指定（zoom, pan, static等）
- 雰囲気・色調の指定

---

## ルート E: Advanced Mode（高品質・企業納品向け）

キーワード: 「高品質」「長時間」「企業納品」「キャラクター一貫性」「4段階パイプライン」

**詳細は advanced_video_analysis スキルを参照**

### 特徴
- 4段階パイプライン（High-Recall → High-Precision → De-dup → Semantic）
- 自動セクション検出（PySceneDetect + SSIM + pHash）
- キャラクター一貫性（character_bible.json）
- 品質検証ループ（OCR読み戻し、レイアウト比較、鮮明度チェック）

### 実行コマンド
```bash
# Advanced Mode パイプライン
python3 scripts/advanced_video_analysis/pipeline.py \
  --input "video.mp4" \
  --project "training_video" \
  --output "./out"

# 品質検証
python3 scripts/advanced_video_analysis/quality_checker.py \
  --generated "./generated_slides/" \
  --jobs "./nanobanana_jobs/"
```

---

## ルート F: Parallel Advanced Mode（高品質+高速）

キーワード: 「並列処理」「40-60%短縮」「高速」「大量動画」「Parallel Advanced」

**詳細は slide2.md スキルを参照**

### 特徴
- **40-60%の処理時間短縮**（品質は維持）
- 5フェーズ並列処理:
  - Frame OCR (3-4x speedup)
  - NanoBanana画像生成 (5-10x speedup)
  - TTS音声生成 (3-5x speedup)
  - FFmpegセグメント作成 (2-3x speedup)
  - 品質検証 (2-4x speedup)
- 4段階パイプラインによる高精度セクション検出
- Character Bible によるキャラクター一貫性
- 品質検証ループ（OCR読み戻し、レイアウト比較、鮮明度チェック）
- Google Cloud TTS Neural2-D による最高品質日本語音声

### 推奨シナリオ
- 高品質かつ高速処理が必要な場合
- 大量の動画を処理する場合
- 8コア以上のCPUを持つシステム

### 実行例
```python
from parallel_processor import run_parallel_pipeline

result = run_parallel_pipeline(
    video_path="input_video.mp4",
    output_dir="./output",
    config={
        "ocr_workers": 8,
        "nanobanana_workers": 4,
        "tts_workers": 6,
        "ffmpeg_workers": 4,
        "quality_workers": 8
    }
)
```

---

## 重要なルール

- **1つずつ確認しながら進める**（自動で全部やらない）
- **各ステップで検証を通す**（壊れたまま次に進まない）
- **元動画のコピーにならないよう台本は必ず書き換える**
- **第三者の声・顔の模倣は禁止**（本人許諾がある素材のみ）
- **セクション検証必須**（カバー率100%を確認）
- **画像アスペクト比維持**（カバースタイルで潰れ防止）
- **日本語音声は Neural2 必須**（ja-JP-Neural2-D 推奨）

---

## セクション検証（全ルート共通・必須）

**セクション数 = 元動画の画面切り替え回数**（動画長さから推定しない）

```bash
# 検証スクリプト実行
python3 scripts/validate_sections.py --sections sections_data.json --video input.mp4
```

### 合格基準
- カバー率 = 100%
- ギャップ = 0

詳細は `.claude/skills/スライド.md` の「■ 0.5 セクション計測ルール」を参照。

---

## 迷ったときの対応

ユーザーの意図が不明なときは、以下を確認する:
1. 何を入力として持っているか？
   - YouTubeリンク → ルート A
   - SRT/VTT字幕 → ルート B
   - ローカル動画 → ルート C
   - structure.json → 台本生成へ
   - structure + narration → 動画生成へ

2. 何を出力したいか？
   - 構造（structure.json）
   - 台本（narration.md）
   - 動画（output.mp4）

3. どのモードを使うか？
   - 5分以下、急ぎ → Quick Mode（スライド.md）
   - 15分以上、高品質 → Advanced Mode（advanced_video_analysis）
   - **高品質+高速、大量処理** → **Parallel Advanced Mode（slide2.md）**

---

## 使い方の例

```
ユーザー: 「動画制作を始めたい」
→ 「何をお持ちですか？」
  - YouTubeリンク → ルート A
  - SRT/VTT字幕 → ルート B
  - ローカル動画 → ルート C

ユーザー: 「YouTubeの字幕が取れない」
→ ルート B（yt-dlp で字幕をダウンロード）または ルート C（Whisper）を案内

ユーザー: 「Whisperがインストールされていない」
→ インストール手順を案内:
  pip install openai-whisper

ユーザー: 「台本を早く作りたい」
→ npm run narration:skeleton を案内
→ APIキーがあれば npm run narration:generate も案内
```
