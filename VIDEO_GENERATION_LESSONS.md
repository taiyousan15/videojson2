# 動画生成プロジェクト - 教訓とチェックリスト

> **このドキュメントは必読です。動画生成プロジェクトを開始する前に必ず確認してください。**

---

## 過去の重大な問題と教訓

### 問題1: 画像パスの不一致
**発生プロジェクト**: training_video_26

**現象**: スライドに画像が表示されない（グレーのプレースホルダーが表示）

**原因**:
```
JSONで指定したファイル名 ≠ 実際に生成されたファイル名

例：
  JSON指定: "img_s22_lv_1.png"
  実際のファイル: "img_s22_lv_golden.png"
```

**対策**:
- 画像生成後、ファイル名を必ずコピー&ペーストでJSONに記載
- `verify_images.py`を実行して全パスの存在確認
- 検証に失敗したらスライド生成に進まない

---

### 問題2: アスペクト比の歪み
**発生プロジェクト**: training_video_26

**現象**: 人物の顔が縦に伸びる、横に潰れる

**原因**:
```python
# NG: 強制リサイズ（アスペクト比無視）
img.resize((200, 300))

# 元画像が1:1で、ターゲットが200x300の場合
# → 縦に1.5倍引き伸ばされる
```

**対策**:
```python
from PIL import ImageOps

# OK: アスペクト比を維持して中央クロップ
ImageOps.fit(img, (200, 300), Image.LANCZOS, centering=(0.5, 0.5))
```

---

### 問題3: 動画時間の大幅な短縮
**発生プロジェクト**: training_video_26

**現象**: 元動画24分 → 生成動画7分28秒

**原因**: ナレーションテキストが短すぎた（100-170文字/セクション）

**対策**:
- 目標時間から逆算して必要文字数を計算
- 日本語: 約300文字/分 → 24分なら約7,200文字必要
- セクションごとに300-600文字を目安に

---

## 必須チェックリスト

### Phase 1: 画像生成
- [ ] 命名規則を事前に決定 (`img_{section}_{brand}_{variant}.png`)
- [ ] 生成した全画像のファイル名をメモ
- [ ] ファイルサイズが0でないことを確認
- [ ] 画像を開いて内容を目視確認

### Phase 2: JSON仕様書作成
- [ ] 画像パスは実際のファイル名をコピー&ペースト（手入力禁止）
- [ ] `verify_images.py`で全パスの存在確認を実行
- [ ] 検証失敗 → スライド生成に進まない

### Phase 3: スライド生成
- [ ] **アスペクト比維持**: `ImageOps.fit()`を使用
- [ ] 全スライドをサムネイル表示で目視確認
- [ ] プレースホルダー（グレー画像）がないことを確認
- [ ] 人物の顔が歪んでいないことを確認

### Phase 4: エンコード前
- [ ] 全スライドを連番で閲覧
- [ ] ギャラリー系スライドは特に注意
- [ ] 問題があればスライド生成からやり直し

---

## テンプレートコード

### 画像パス検証スクリプト
```python
def verify_all_images(sections_file, images_dir):
    """全画像パスの存在確認（スライド生成前に必須実行）"""
    import json
    from pathlib import Path

    with open(sections_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    missing = []
    found = []

    for section in data['sections']:
        for key in ['existing_image', 'existing_images']:
            images = section.get(key, [])
            if isinstance(images, str):
                images = [images]
            for img in images:
                img_path = Path(images_dir) / img
                if img_path.exists():
                    found.append(f"{section['id']}: {img}")
                else:
                    missing.append(f"{section['id']}: {img}")

    print(f"検証結果: 発見 {len(found)} 件, 欠落 {len(missing)} 件")

    if missing:
        print("\n【エラー】以下の画像が見つかりません:")
        for m in missing:
            print(f"  - {m}")
        raise Exception("画像パス検証に失敗しました")

    print("【OK】全画像パスの検証に成功しました")
    return True
```

### アスペクト比維持の画像読み込み
```python
from PIL import Image, ImageOps

def load_image_fit(path, size):
    """アスペクト比を維持しながら指定サイズにフィット（中央クロップ）"""
    if path and Path(path).exists():
        img = Image.open(path).convert("RGB")
        return ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.5))
    return Image.new("RGB", size, (51, 51, 51))

def load_image_contain(path, size, bg_color=(26, 26, 46)):
    """アスペクト比を維持しながらサイズ内に収める（余白あり）"""
    if path and Path(path).exists():
        img = Image.open(path).convert("RGB")
        img.thumbnail(size, Image.LANCZOS)
        bg = Image.new("RGB", size, bg_color)
        x = (size[0] - img.width) // 2
        y = (size[1] - img.height) // 2
        bg.paste(img, (x, y))
        return bg
    return Image.new("RGB", size, (51, 51, 51))
```

---

## 結論

> **「生成完了」は「品質確認完了」ではない**
>
> 自動生成システムでは、各フェーズで検証を行い、
> 問題を早期発見・修正することが重要。

---

*作成日: 2026-01-04*
*適用対象: videoJSON2配下の全動画生成プロジェクト*
