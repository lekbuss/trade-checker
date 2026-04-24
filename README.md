# 貿易書類AI核対システム（Trade Document Checker）

貿易書類（Invoice・Packing List・B/L・原産地証明書）をアップロードするだけで、AIが書類の種別を自動判定し、フィールドを抽出・照合して差異を検出。修正指示を日本語で自動生成します。

---

## 主な機能

| 機能 | 説明 |
|------|------|
| **書類種別の自動判定** | ファイルをアップロードするとAIが Invoice / Packing List / B/L / 原産地証明書のいずれかを自動識別 |
| **フィールド抽出** | Claude Vision APIがPDF・Excel・メールから構造化データを抽出 |
| **差異検出** | 書類間のHS コード・数量・重量・取引金額などを自動照合 |
| **重大度分類** | 差異を FATAL（通関影響あり）/ MINOR の2段階で評価 |
| **修正指示生成** | 発見された差異ごとに日本語の修正手順を自動生成 |
| **エクスポート** | 差異レポートを JSON / CSV 形式でダウンロード |

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| バックエンド | Next.js API Routes (同一プロセス) |
| データベース | PostgreSQL 16 + Prisma 7 ORM |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| ファイル前処理 | Python 3.11 + FastAPI + pdfplumber + pdf2image + openpyxl |
| インフラ | Docker Compose (3サービス構成) |
| テスト | Vitest |

---

## システム構成

```
┌─────────────────────────────────────────────────────────┐
│                    ブラウザ (3000番)                       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              Next.js アプリ (3000番)                      │
│  ・フロントエンド UI                                        │
│  ・API Routes (アップロード / 処理 / エクスポート)             │
│  ・Prisma ORM → PostgreSQL                               │
└────────┬───────────────────────────────────────────────┘
         │ HTTP
┌────────▼────────────────────────────────────────────────┐
│         Python サービス (8001番)                          │
│  ・PDF テキスト抽出 (pdfplumber)                           │
│  ・スキャンPDF 画像化 (pdf2image)                          │
│  ・Excel 読み込み (openpyxl)                              │
│  ・メール解析                                              │
└─────────────────────────────────────────────────────────┘
```

---

## 必要な環境

- **Docker Desktop** （[ダウンロード](https://www.docker.com/products/docker-desktop/)）
- **Anthropic API キー** （[取得はこちら](https://console.anthropic.com/)）

---

## セットアップ手順（Docker Compose）

### 1. リポジトリをクローン

```bash
git clone https://github.com/lekbuss/trade-checker.git
cd trade-checker
```

### 2. 環境変数ファイルを作成

プロジェクトルートに `.env` ファイルを作成し、以下の内容を記述します。

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trade_checker"
ANTHROPIC_API_KEY="sk-ant-api03-あなたのAPIキー"
```

> **注意：** `.env` ファイルは `.gitignore` で除外されています。APIキーをリポジトリにコミットしないでください。

### 3. Docker Desktop を起動

タスクバーの Docker アイコンが安定するまで待ちます（約1〜2分）。

### 4. コンテナをビルド・起動

```bash
docker compose up -d --build
```

初回はビルドに5〜10分かかります。

### 5. データベースマイグレーション

```bash
docker compose exec nextjs pnpm prisma migrate deploy
```

### 6. ブラウザで開く

```
http://localhost:3000
```

---

## 使い方

### バッチ処理の手順

1. トップページでバッチ名を入力（例：`2024-05 ABC Corp 輸入便`）
2. 書類ファイルをドラッグ＆ドロップ（2件以上）
   - PDF・Excel（.xlsx）・メール（.eml）に対応
   - **書類の種類はAIが自動判定**します（Invoice / Packing List / B/L / 原産地証明書）
3. **「処理を開始する」** ボタンをクリック
4. AIが書類を解析（30秒〜2分）
5. 差異レポートが自動生成されます

### 差異レポートの見方

| 色 | 重大度 | 意味 |
|----|--------|------|
| 🔴 赤 | FATAL | 通関に影響する可能性のある重大な差異（HS コード・原産国・取引金額） |
| 🟡 黄 | MINOR | 軽微な差異（数量・重量・品名の表記ゆれ等） |

各差異には Claude が生成した **日本語の修正指示** が付記されます。
対応が完了したら「解決済み」マークをつけて管理できます。

---

## 差異チェック項目一覧

| 比較対象 | チェック項目 | 重大度 |
|---------|------------|--------|
| Invoice × Packing List | 品名・数量 | MINOR |
| Invoice × B/L | 荷送人名（Supplier = Shipper） | MINOR |
| Invoice × 原産地証明書 | HSコード・原産国・品名・取引金額 | FATAL / MINOR |
| B/L × Packing List | 総重量・総体積・カートン数 | MINOR |

---

## 画面一覧

| URL | 説明 |
|-----|------|
| `/` | 書類アップロード・処理実行 |
| `/shipments` | バッチ一覧（FATAL/MINOR件数付き） |
| `/shipments/[id]` | バッチ詳細・差異レポート |
| `/export` | JSON/CSV エクスポート |

---

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/shipments` | バッチ一覧取得 |
| `POST` | `/api/shipments` | バッチ作成 |
| `GET` | `/api/shipments/[id]` | バッチ詳細取得 |
| `POST` | `/api/documents/upload` | ファイルアップロード（種別自動判定） |
| `POST` | `/api/process/[id]` | AI処理実行 |
| `PATCH` | `/api/shipments/[id]/discrepancies/[did]` | 差異ステータス更新 |
| `GET` | `/api/export/[id]?format=json\|csv` | レポートエクスポート |

---

## ローカル開発環境（Docker 不使用）

Docker を使わずに開発する場合の手順です。

### 前提条件

- Node.js 20 以上
- pnpm（`npm install -g pnpm`）
- Python 3.11 以上
- PostgreSQL 16（ローカルまたは Docker 単体起動）

### 手順

```bash
# 1. 依存パッケージのインストール
pnpm install

# 2. .env.local を作成
# DATABASE_URL と ANTHROPIC_API_KEY と PYTHON_SERVICE_URL を設定
# PYTHON_SERVICE_URL="http://localhost:8001"

# 3. PostgreSQL のみ Docker で起動
docker compose up postgres -d

# 4. マイグレーション実行
pnpm prisma migrate deploy

# 5. Python サービスを起動（別ターミナル）
cd python-service
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# 6. Next.js 開発サーバーを起動
pnpm dev
```

### テスト実行

```bash
pnpm test
```

---

## ファイル構成

```
trade-checker/
├── app/                        # Next.js App Router
│   ├── (dashboard)/
│   │   ├── page.tsx            # トップページ（アップロード）
│   │   ├── shipments/          # バッチ一覧・詳細
│   │   └── export/             # エクスポートページ
│   └── api/                    # API Routes
│       ├── documents/upload/   # ファイルアップロード（種別自動判定）
│       ├── process/[id]/       # AI処理オーケストレーション
│       ├── shipments/          # バッチ CRUD
│       └── export/[id]/        # エクスポート
├── lib/
│   ├── extractor.ts            # Claude による抽出・種別判定
│   ├── rule-engine.ts          # 差異検出ロジック
│   ├── claude.ts               # 修正指示生成
│   └── prisma.ts               # Prisma クライアント
├── components/                 # UI コンポーネント
├── prisma/
│   ├── schema.prisma           # データベーススキーマ
│   └── migrations/             # マイグレーションファイル
├── python-service/             # FastAPI ファイル前処理サービス
├── docker-compose.yml
├── Dockerfile
└── .env.example                # 環境変数のサンプル
```

---

## トラブルシューティング

### Docker が起動しない

Docker Desktop が起動しているか確認してください（タスクバーの鯨アイコン）。

### `.env` ファイルの文字コードエラー

PowerShell の `>>` 演算子は UTF-16 で書き込むため、Docker Compose がエラーになります。
メモ帳や VS Code で `.env` を直接編集し、UTF-8 で保存してください。

### ビルドでメモリエラーが出る

Docker Desktop の設定でメモリを **4GB 以上** に増やしてください。
（Settings → Resources → Memory）

### Prisma の接続エラー

```bash
docker compose ps
```
で `postgres` コンテナが `healthy` になっているか確認してください。

---

## ライセンス

MIT
