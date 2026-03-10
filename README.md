# TOEIC Learning Quiz (Static)

TOEIC頻出語彙を中心とした語彙データを使う、静的Webクイズアプリです。

- 4択クイズ
- `英語 -> 日本語` / `日本語 -> 英語` / ミックス
- 英語の読み上げ（手動再生 / 出題時自動再生 / 音声種類・速度の調整）
- 音声問題モード（英→日は音声のみ出題、日→英は選択肢ごとの再生）
- 各語彙の解説（英語例文・類義語・対義語・語源）を回答後に表示
- 解説内の例文・類義語・対義語を個別に音声再生
- 語源のGoogle検索結果を別タブで開くボタン
- 単語・熟語ごとの正解実績を `localStorage` に保存
- 苦手語彙TOP10表示
- ビルド不要（`index.html` を中心とした静的ファイルのみ）

## ローカルで確認

```bash
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開いてください。

## GitHub Pages で公開

1. このリポジトリを GitHub に push する
2. GitHub の `Settings > Pages` を開く
3. `Build and deployment` の `Source` を `GitHub Actions` にする
4. `main` ブランチへ push すると `.github/workflows/deploy-pages.yml` が実行され公開される

## 語彙データ

- `vocabulary.js`: アプリが直接読む語彙データ
- `vocabulary.generated.json`: 語彙データのJSON版
- `scripts/generate_explanations.py`: 各語彙の解説（例文・類義語・対義語・語源）を生成
- 追加語彙は Web 上の TOEIC 頻出語リスト（TSL 1.1）をもとに反映
  - https://www.newgeneralservicelist.org/toeic-list
  - https://www.newgeneralservicelist.org/files/s/tsl_11_alphabetized_description.txt

解説を再生成する場合:

```bash
python3 -m pip install --user nltk
python3 - <<'PY'
import nltk
nltk.download('wordnet')
nltk.download('omw-1.4')
PY
python3 scripts/generate_explanations.py
```
