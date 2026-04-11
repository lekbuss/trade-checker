# Trade Document Checker（貿易書類AI核対システム）

## 概要

Invoice / Packing List / B/L / 原産地証明書の4種類の貿易書類をアップロードすると、
Claude Vision APIが各書類からフィールドを抽出し、規則エンジンが差異を検出、
LLMが修正指示を日本語で生成します。

## 技術スタック

- **フロントエンド/バックエンド**: Next.js 16 (App Router) + Tailwind CSS + shadcn/ui
- **データベース**: PostgreSQL 16 + Prisma 7 ORM
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **ファイル前処理**: Python 3.11 + FastAPI + pdfplumber + pdf2image + openpyxl
- **インフラ**: Docker Compose

## 環境構築

### 前提条件

- Docker Desktop インストール済み
- Node.js 20+, pnpm インストール済み
- Anthropic API キー取得済み

### 手順

1. `.env.local` を作成：
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trade_checker"
   ANTHROPIC_API_KEY="your_api_key_here"
   PYTHON_SERVICE_URL="http://localhost:8001"
   NEXT_PUBLIC_APP_NAME="Trade Document Checker"
   ```

2. PostgreSQL を Docker で起動：
   ```bash
   docker compose up postgres -d
   ```

3. マイグレーションとシード：
   ```bash
   pnpm install
   pnpm dlx prisma migrate deploy
   pnpm dlx prisma db seed
   ```

4. 開発サーバーを起動：
   ```bash
   pnpm dev
   ```

5. ブラウザで `http://localhost:3000` を開く

### Python サービス（ローカル）

```bash
cd python-service
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

### Docker Compose（全サービス）

```bash
docker compose up -d
```

## テスト

```bash
pnpm test
```

## 画面構成

| URL | 説明 |
|-----|------|
| `/` | 書類アップロード・処理実行 |
| `/shipments` | バッチ一覧 |
| `/shipments/[id]` | バッチ詳細・差異レポート |
| `/export` | JSON/CSVエクスポート |

## API エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/shipments` | バッチ一覧 |
| POST | `/api/shipments` | バッチ作成 |
| GET | `/api/shipments/[id]` | バッチ詳細 |
| POST | `/api/documents/upload` | ファイルアップロード |
| POST | `/api/process/[id]` | 処理実行 |
| PATCH | `/api/shipments/[id]/discrepancies/[did]` | 差異ステータス更新 |
| GET | `/api/export/[id]?format=json\|csv` | エクスポート |
