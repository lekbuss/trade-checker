# Trade Document AI Verification System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建贸易文件自动核对系统——用户上传4种贸易文件，Claude Vision API抽取字段，规则引擎比对差异，LLM生成修正指示，导出报告。

**Architecture:** Next.js 14 App Router 同时承担前端和 API（BFF 层），Python FastAPI 微服务负责文件预处理（PDF文本提取 / 扫描版→base64 / Excel解析），Claude API 从文档中抽取结构化 JSON，PostgreSQL via Prisma 持久化数据，Docker Compose 统一编排所有服务。处理流程为同步：上传→预处理→Claude抽取（Promise.allSettled 并发）→规则比对→修正指示生成→返回结果。

**Tech Stack:** Next.js 14, TypeScript (strict), Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL 16, Anthropic Claude API (claude-sonnet-4-20250514), Python 3.11 + FastAPI + pdfplumber + pdf2image + openpyxl, Docker Compose, pnpm, Vitest

---

## 文件地图

### 新建文件

```
# 基础配置
package.json
tsconfig.json
next.config.ts
tailwind.config.ts
components.json                              # shadcn/ui 配置
vitest.config.ts
.env.example
.env.local                                   # 本地开发（不提交）
.gitignore
README.md
docker-compose.yml
Dockerfile                                   # Next.js
python-service/Dockerfile

# Prisma
prisma/schema.prisma
prisma/seed.ts

# 核心库
lib/prisma.ts                                # Prisma client 单例
lib/claude.ts                                # Claude API 封装（修正指示生成）
lib/extractor.ts                             # 4种文档字段抽取（调用Claude）
lib/rule-engine.ts                           # 规则比对引擎
lib/nassc.ts                                 # NASSC 推送占位符

# 测试
lib/__tests__/rule-engine.test.ts
lib/__tests__/extractor.test.ts              # mock Claude响应解析逻辑

# API Routes
app/api/shipments/route.ts                   # GET list / POST create
app/api/shipments/[id]/route.ts              # GET detail
app/api/shipments/[id]/discrepancies/[did]/route.ts  # PATCH status
app/api/documents/upload/route.ts            # POST upload
app/api/process/[shipmentId]/route.ts        # POST trigger processing
app/api/export/[shipmentId]/route.ts         # GET export JSON/CSV

# 前端页面
app/layout.tsx                               # Root layout
app/(dashboard)/layout.tsx                   # Dashboard layout（Nav）
app/(dashboard)/page.tsx                     # 首页：上传
app/(dashboard)/shipments/page.tsx           # 批次列表
app/(dashboard)/shipments/[id]/page.tsx      # 批次详情
app/(dashboard)/export/page.tsx              # 导出页

# 共用组件
components/upload-zone.tsx                   # 拖拽上传区
components/status-badge.tsx                  # 状态徽章
components/discrepancy-list.tsx              # 差异列表
components/extracted-json-dialog.tsx         # JSON查看Dialog

# Python 微服务
python-service/main.py
python-service/processors/pdf_processor.py
python-service/processors/excel_processor.py
python-service/processors/email_processor.py
python-service/requirements.txt

# 文件存储目录（运行时创建）
uploads/                                     # Docker volume mount
```

---

## Task 1: Next.js 项目初始化

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `components.json`, `vitest.config.ts`

- [ ] **Step 1: 在项目根目录初始化 Next.js**

```bash
cd "c:/Users/r00000835/Desktop/easy for docuware"
pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*" --no-git
```

当询问时选择：全部默认（Enter 确认）。

Expected: 生成 `app/`, `package.json`, `tsconfig.json`, `tailwind.config.ts` 等文件。

- [ ] **Step 2: 安装 Prisma 和 Anthropic SDK**

```bash
pnpm add @prisma/client @anthropic-ai/sdk
pnpm add -D prisma
```

Expected: `node_modules/@prisma/client` 和 `node_modules/@anthropic-ai/sdk` 存在。

- [ ] **Step 3: 安装 Vitest**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 4: 创建 vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 5: 在 package.json 中添加 test script**

在 `package.json` 的 `"scripts"` 中添加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: 初始化 shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

选择：Default → Yes（使用 CSS 变量）→ Enter

- [ ] **Step 7: 安装所需 shadcn/ui 组件**

```bash
pnpm dlx shadcn@latest add button card table badge input dialog tooltip select separator label textarea
```

Expected: `components/ui/` 下出现对应组件文件。

- [ ] **Step 8: 确认 tsconfig.json 启用 strict 模式**

打开 `tsconfig.json`，确认包含：
```json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 9: 创建 .env.example**

```bash
cat > .env.example << 'EOF'
DATABASE_URL="postgresql://user:password@localhost:5432/trade_checker"
ANTHROPIC_API_KEY="your_api_key_here"
PYTHON_SERVICE_URL="http://python-service:8001"
NEXT_PUBLIC_APP_NAME="Trade Document Checker"
EOF
```

- [ ] **Step 10: 创建 .env.local（本地开发用）**

```bash
cat > .env.local << 'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trade_checker"
ANTHROPIC_API_KEY="your_actual_key_here"
PYTHON_SERVICE_URL="http://localhost:8001"
NEXT_PUBLIC_APP_NAME="Trade Document Checker"
EOF
```

- [ ] **Step 11: 确认 Next.js 能启动**

```bash
pnpm dev
```

Expected: `Ready on http://localhost:3000` 输出，无 TypeScript 错误。Ctrl+C 停止。

- [ ] **Step 12: Commit**

```bash
git init
git add .
git commit -m "feat: initialize Next.js 14 project with shadcn/ui and Vitest"
```

---

## Task 2: Prisma Schema、Migration、Seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1: 初始化 Prisma**

```bash
pnpm dlx prisma init --datasource-provider postgresql
```

Expected: `prisma/schema.prisma` 和 `.env` 生成（`.env` 与 `.env.local` 分开，`.env` 仅供 Prisma CLI 使用）。

- [ ] **Step 2: 将 DATABASE_URL 写入 .env（Prisma CLI 用）**

```bash
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trade_checker"' > .env
```

- [ ] **Step 3: 写入完整 Schema**

将 `prisma/schema.prisma` 替换为：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Shipment {
  id            String         @id @default(cuid())
  name          String
  status        ShipmentStatus @default(PENDING)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  documents     Document[]
  discrepancies Discrepancy[]
}

enum ShipmentStatus {
  PENDING
  PROCESSING
  DONE
  ERROR
}

model Document {
  id              String    @id @default(cuid())
  shipmentId      String
  shipment        Shipment  @relation(fields: [shipmentId], references: [id])
  docType         DocType
  fileType        FileType
  filePath        String
  status          DocStatus @default(PENDING)
  extractedData   Json?
  confidenceScore Float?
  createdAt       DateTime  @default(now())
}

enum DocType {
  INVOICE
  PACKING_LIST
  BL
  ORIGIN_CERT
}

enum FileType {
  PDF_TEXT
  PDF_SCAN
  EXCEL
  EMAIL
}

enum DocStatus {
  PENDING
  PROCESSING
  DONE
  ERROR
}

model Discrepancy {
  id             String            @id @default(cuid())
  shipmentId     String
  shipment       Shipment          @relation(fields: [shipmentId], references: [id])
  fieldName      String
  docA           DocType
  docB           DocType
  valueA         String
  valueB         String
  severity       Severity
  correctionNote String?
  status         DiscrepancyStatus @default(OPEN)
  createdAt      DateTime          @default(now())
}

enum Severity {
  FATAL
  MINOR
}

enum DiscrepancyStatus {
  OPEN
  RESOLVED
}

model ToleranceRule {
  id        String   @id @default(cuid())
  fieldName String   @unique
  ruleType  String
  ruleValue Json
  createdAt DateTime @default(now())
}
```

- [ ] **Step 4: 创建 Seed 脚本**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rules = [
    { fieldName: 'total_gross_weight_kg', ruleType: 'percentage', ruleValue: { threshold: 0.005 } },
    { fieldName: 'total_volume_m3',       ruleType: 'percentage', ruleValue: { threshold: 0.01  } },
    { fieldName: 'total_amount',          ruleType: 'percentage', ruleValue: { threshold: 0.005 } },
    { fieldName: 'quantity',              ruleType: 'absolute',   ruleValue: { threshold: 1     } },
    { fieldName: 'hs_code',               ruleType: 'exact',      ruleValue: {}                   },
    { fieldName: 'country_of_origin',     ruleType: 'exact',      ruleValue: {}                   },
  ]

  for (const rule of rules) {
    await prisma.toleranceRule.upsert({
      where: { fieldName: rule.fieldName },
      update: rule,
      create: rule,
    })
  }

  console.log('Seeded', rules.length, 'tolerance rules.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 5: package.json に seed 設定を追加**

`package.json` の末尾に追加：

```json
"prisma": {
  "seed": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' prisma/seed.ts"
}
```

また ts-node をインストール：

```bash
pnpm add -D ts-node
```

- [ ] **Step 6: PostgreSQL が起動していることを確認し Migration を実行**

```bash
pnpm dlx prisma migrate dev --name init
```

Expected: `✔ Generated Prisma Client` と `Database is now in sync with your schema.` が表示される。

（PostgreSQLがローカルにない場合は Task 3 の Docker Compose を先に完了してから実行）

- [ ] **Step 7: Seed を実行**

```bash
pnpm dlx prisma db seed
```

Expected: `Seeded 6 tolerance rules.`

- [ ] **Step 8: Commit**

```bash
git add prisma/ package.json
git commit -m "feat: add Prisma schema with all models and seed tolerance rules"
```

---

## Task 3: Docker Compose と Dockerfile

**Files:**
- Create: `docker-compose.yml`, `Dockerfile`, `python-service/Dockerfile`

- [ ] **Step 1: Next.js の Dockerfile を作成**

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p uploads && chown nextjs:nodejs uploads
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: next.config.ts に standalone 出力を設定**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
```

- [ ] **Step 3: Python サービスの Dockerfile を作成**

```dockerfile
# python-service/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [ ] **Step 4: docker-compose.yml を作成**

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: trade_checker
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  python-service:
    build:
      context: ./python-service
      dockerfile: Dockerfile
    ports:
      - "8001:8001"
    environment:
      - PYTHONUNBUFFERED=1
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/trade_checker"
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      PYTHON_SERVICE_URL: "http://python-service:8001"
      NEXT_PUBLIC_APP_NAME: "Trade Document Checker"
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      python-service:
        condition: service_healthy

volumes:
  postgres_data:
  uploads_data:
```

- [ ] **Step 5: .gitignore を作成**

```gitignore
# .gitignore
.env
.env.local
node_modules/
.next/
uploads/
__pycache__/
*.pyc
.venv/
dist/
*.egg-info/
.DS_Store
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml Dockerfile python-service/Dockerfile next.config.ts .gitignore
git commit -m "feat: add Docker Compose with Next.js, Python service, and PostgreSQL"
```

---

## Task 4: Python FastAPI 微服务

**Files:**
- Create: `python-service/main.py`, `python-service/processors/pdf_processor.py`, `python-service/processors/excel_processor.py`, `python-service/processors/email_processor.py`, `python-service/requirements.txt`

- [ ] **Step 1: requirements.txt を作成**

```text
# python-service/requirements.txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
pdfplumber==0.11.0
pdf2image==1.17.0
openpyxl==3.1.2
python-multipart==0.0.9
Pillow==10.3.0
```

- [ ] **Step 2: pdf_processor.py を作成**

```python
# python-service/processors/pdf_processor.py
import io
import base64
import pdfplumber
from pdf2image import convert_from_bytes


def extract_text(file_bytes: bytes) -> dict:
    """PDF からテキストを抽出する（テキスト層あり）"""
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
    return {"success": True, "text": text.strip(), "images": []}


def extract_images(file_bytes: bytes) -> dict:
    """スキャン版 PDF を JPEG base64 画像配列に変換する"""
    images = convert_from_bytes(file_bytes, dpi=200, fmt="jpeg")
    encoded = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        encoded.append(base64.b64encode(buf.getvalue()).decode("utf-8"))
    return {"success": True, "text": "", "images": encoded}


def detect_and_extract(file_bytes: bytes) -> dict:
    """テキスト層があれば extract_text、なければ extract_images を実行"""
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text += t
    if len(text.strip()) >= 50:
        return extract_text(file_bytes)
    return extract_images(file_bytes)
```

- [ ] **Step 3: excel_processor.py を作成**

```python
# python-service/processors/excel_processor.py
import io
import openpyxl


def extract_text(file_bytes: bytes) -> dict:
    """Excel ファイルの全セルをテキストとして抽出する"""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    lines = []
    for sheet in wb.worksheets:
        lines.append(f"[Sheet: {sheet.title}]")
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            line = "\t".join(cells).strip()
            if line:
                lines.append(line)
    return {"success": True, "text": "\n".join(lines), "images": []}
```

- [ ] **Step 4: email_processor.py を作成**

```python
# python-service/processors/email_processor.py
import email
from email import policy


def extract_text(file_bytes: bytes) -> dict:
    """メール本文とテキスト添付ファイルを抽出する"""
    msg = email.message_from_bytes(file_bytes, policy=policy.default)
    parts = []

    subject = msg.get("Subject", "")
    if subject:
        parts.append(f"Subject: {subject}")

    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = str(part.get("Content-Disposition", ""))

        if content_type == "text/plain" and "attachment" not in disposition:
            payload = part.get_payload(decode=True)
            if payload:
                parts.append(payload.decode("utf-8", errors="replace"))

    return {"success": True, "text": "\n".join(parts), "images": []}
```

- [ ] **Step 5: main.py を作成**

```python
# python-service/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from processors.pdf_processor import extract_text as pdf_text, extract_images as pdf_images, detect_and_extract
from processors.excel_processor import extract_text as excel_text
from processors.email_processor import extract_text as email_text

app = FastAPI(title="Trade Document Preprocessor")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process/pdf-text")
async def process_pdf_text(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return pdf_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/pdf-scan")
async def process_pdf_scan(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return pdf_images(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/pdf-auto")
async def process_pdf_auto(file: UploadFile = File(...)):
    """テキスト層の有無を自動判定して処理する"""
    try:
        content = await file.read()
        return detect_and_extract(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/excel")
async def process_excel(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return excel_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/email")
async def process_email(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return email_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 6: python-service/__init__.py を作成（processors パッケージ用）**

```bash
touch python-service/__init__.py
touch python-service/processors/__init__.py
```

- [ ] **Step 7: Python サービスをローカルで起動確認**

```bash
cd python-service
python -m venv .venv
source .venv/Scripts/activate   # Windows の場合
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

ブラウザで `http://localhost:8001/health` を開く。
Expected: `{"status":"ok"}`

Ctrl+C で停止し、プロジェクトルートに戻る：
```bash
cd ..
```

- [ ] **Step 8: Commit**

```bash
git add python-service/
git commit -m "feat: add Python FastAPI microservice with PDF/Excel/Email processors"
```

---

## Task 5: Prisma Client シングルトン と 基盤ライブラリ

**Files:**
- Create: `lib/prisma.ts`, `lib/nassc.ts`

- [ ] **Step 1: Prisma クライアントシングルトンを作成**

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 2: NASSC 占位符モジュールを作成**

```typescript
// lib/nassc.ts
/**
 * NASSC システム連携モジュール（占位符）
 * API 仕様が確定次第、実装を置き換える。
 */
export async function pushToNassc(shipmentId: string): Promise<void> {
  console.log(`[NASSC] pushToNassc called for shipment: ${shipmentId} (not yet implemented)`)
  // TODO: NASSC API 仕様確定後に実装
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/
git commit -m "feat: add Prisma client singleton and NASSC placeholder"
```

---

## Task 6: 規則エンジン（TDD）

**Files:**
- Create: `lib/rule-engine.ts`, `lib/__tests__/rule-engine.test.ts`

- [ ] **Step 1: テストファイルを作成（まず空にする）**

```bash
mkdir -p lib/__tests__
touch lib/__tests__/rule-engine.test.ts
```

- [ ] **Step 2: 失敗するテストを書く**

```typescript
// lib/__tests__/rule-engine.test.ts
import { describe, it, expect } from 'vitest'
import { compareValues, runRuleEngine } from '../rule-engine'
import type { ExtractedDocuments, DiscrepancyResult } from '../rule-engine'

describe('compareValues', () => {
  it('exact: 同じ値は差異なし', () => {
    expect(compareValues('8471.30', '8471.30', 'exact', {})).toBe(false)
  })

  it('exact: 異なる値は差異あり', () => {
    expect(compareValues('8471.30', '8471.31', 'exact', {})).toBe(true)
  })

  it('percentage: 閾値内は差異なし', () => {
    // 100 vs 100.4 → 差分 0.4 / 100 = 0.4% < 0.5%
    expect(compareValues('100', '100.4', 'percentage', { threshold: 0.005 })).toBe(false)
  })

  it('percentage: 閾値超えは差異あり', () => {
    // 100 vs 101 → 差分 1 / 101 = 0.99% > 0.5%
    expect(compareValues('100', '101', 'percentage', { threshold: 0.005 })).toBe(true)
  })

  it('absolute: 閾値内は差異なし', () => {
    expect(compareValues('10', '11', 'absolute', { threshold: 1 })).toBe(false)
  })

  it('absolute: 閾値超えは差異あり', () => {
    expect(compareValues('10', '12', 'absolute', { threshold: 1 })).toBe(true)
  })

  it('片方が null の場合は差異あり', () => {
    expect(compareValues(null, '100', 'exact', {})).toBe(true)
  })

  it('両方 null の場合は差異なし', () => {
    expect(compareValues(null, null, 'exact', {})).toBe(false)
  })
})

describe('runRuleEngine', () => {
  const baseDocuments: ExtractedDocuments = {
    INVOICE: {
      supplier_name: 'ABC Corp',
      consignee_name: 'XYZ Ltd',
      invoice_number: 'INV-001',
      invoice_date: '2024-01-01',
      items: [{ description: 'Widget A', hs_code: '8471.30', quantity: 100, unit: 'PCS', unit_price: 10, amount: 1000, country_of_origin: 'Japan' }],
      total_amount: 1000,
      currency: 'USD',
      incoterm: 'FOB',
    },
    PACKING_LIST: {
      supplier_name: 'ABC Corp',
      consignee_name: 'XYZ Ltd',
      pl_number: 'PL-001',
      pl_date: '2024-01-01',
      items: [{ description: 'Widget A', quantity: 100, unit: 'PCS', gross_weight_kg: 500, net_weight_kg: 450, volume_m3: 1.0, cartons: 10 }],
      total_gross_weight_kg: 500,
      total_net_weight_kg: 450,
      total_volume_m3: 1.0,
      total_cartons: 10,
    },
    BL: {
      bl_number: 'BL-001',
      bl_date: '2024-01-01',
      shipper_name: 'ABC Corp',
      consignee_name: 'XYZ Ltd',
      notify_party: null,
      vessel_name: 'MV Test',
      voyage_number: 'V001',
      port_of_loading: 'Tokyo',
      port_of_discharge: 'Los Angeles',
      place_of_delivery: 'Los Angeles',
      items: [{ description: 'Widget A', quantity: 10, gross_weight_kg: 500, volume_m3: 1.0 }],
      total_gross_weight_kg: 500,
      total_volume_m3: 1.0,
      freight_amount: null,
      freight_currency: null,
      freight_type: 'PREPAID',
    },
    ORIGIN_CERT: {
      cert_number: 'OC-001',
      cert_date: '2024-01-01',
      exporter_name: 'ABC Corp',
      importer_name: 'XYZ Ltd',
      items: [{ line_number: 1, description: 'Widget A', hs_code: '8471.30', country_of_origin: 'Japan', quantity: 100, unit: 'PCS', gross_weight_kg: 500, transaction_value: 1000 }],
      total_gross_weight_kg: 500,
      total_transaction_value: 1000,
      issuing_authority: 'Japan Chamber',
    },
  }

  it('全データ一致の場合は差異なし', async () => {
    const result = await runRuleEngine(baseDocuments)
    expect(result).toHaveLength(0)
  })

  it('HS コード不一致は FATAL', async () => {
    const docs = {
      ...baseDocuments,
      ORIGIN_CERT: {
        ...baseDocuments.ORIGIN_CERT,
        items: [{ ...baseDocuments.ORIGIN_CERT!.items[0], hs_code: '9999.99' }],
      },
    }
    const result = await runRuleEngine(docs)
    const hsDiscrepancy = result.find(d => d.fieldName === 'hs_code')
    expect(hsDiscrepancy).toBeDefined()
    expect(hsDiscrepancy?.severity).toBe('FATAL')
  })

  it('重量が容許誤差内は差異なし', async () => {
    const docs = {
      ...baseDocuments,
      BL: { ...baseDocuments.BL!, total_gross_weight_kg: 502 }, // 0.4% 差 < 0.5%
    }
    const result = await runRuleEngine(docs)
    const weightDiscrepancy = result.find(d => d.fieldName === 'total_gross_weight_kg' && d.docA === 'INVOICE' && d.docB === 'BL')
    expect(weightDiscrepancy).toBeUndefined()
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
pnpm test
```

Expected: `Cannot find module '../rule-engine'` エラー。

- [ ] **Step 4: 型定義と rule-engine.ts を実装**

```typescript
// lib/rule-engine.ts
import { prisma } from './prisma'

// ─── 型定義 ────────────────────────────────────────────────────────────

export interface InvoiceItem {
  description: string | null
  hs_code: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  amount: number | null
  country_of_origin: string | null
}

export interface InvoiceData {
  supplier_name: string | null
  consignee_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  items: InvoiceItem[]
  total_amount: number | null
  currency: string | null
  incoterm: string | null
}

export interface PackingListItem {
  description: string | null
  quantity: number | null
  unit: string | null
  gross_weight_kg: number | null
  net_weight_kg: number | null
  volume_m3: number | null
  cartons: number | null
}

export interface PackingListData {
  supplier_name: string | null
  consignee_name: string | null
  pl_number: string | null
  pl_date: string | null
  items: PackingListItem[]
  total_gross_weight_kg: number | null
  total_net_weight_kg: number | null
  total_volume_m3: number | null
  total_cartons: number | null
}

export interface BLItem {
  description: string | null
  quantity: number | null
  gross_weight_kg: number | null
  volume_m3: number | null
}

export interface BLData {
  bl_number: string | null
  bl_date: string | null
  shipper_name: string | null
  consignee_name: string | null
  notify_party: string | null
  vessel_name: string | null
  voyage_number: string | null
  port_of_loading: string | null
  port_of_discharge: string | null
  place_of_delivery: string | null
  items: BLItem[]
  total_gross_weight_kg: number | null
  total_volume_m3: number | null
  freight_amount: number | null
  freight_currency: string | null
  freight_type: string | null
}

export interface OriginCertItem {
  line_number: number | null
  description: string | null
  hs_code: string | null
  country_of_origin: string | null
  quantity: number | null
  unit: string | null
  gross_weight_kg: number | null
  transaction_value: number | null
}

export interface OriginCertData {
  cert_number: string | null
  cert_date: string | null
  exporter_name: string | null
  importer_name: string | null
  items: OriginCertItem[]
  total_gross_weight_kg: number | null
  total_transaction_value: number | null
  issuing_authority: string | null
}

export interface ExtractedDocuments {
  INVOICE?: InvoiceData | null
  PACKING_LIST?: PackingListData | null
  BL?: BLData | null
  ORIGIN_CERT?: OriginCertData | null
}

export interface DiscrepancyResult {
  fieldName: string
  docA: 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
  docB: 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
  valueA: string
  valueB: string
  severity: 'FATAL' | 'MINOR'
}

// ─── 比較ロジック ────────────────────────────────────────────────────

/**
 * 2つの値を指定ルールで比較し、差異があれば true を返す
 */
export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  ruleType: string,
  ruleValue: Record<string, number>
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return !(a === null || a === undefined) || !(b === null || b === undefined)
      ? (a !== null && a !== undefined) || (b !== null && b !== undefined)
        ? a !== b
        : false
      : false
  }

  if (ruleType === 'exact') {
    return String(a).trim() !== String(b).trim()
  }

  const numA = Number(a)
  const numB = Number(b)
  if (isNaN(numA) || isNaN(numB)) {
    return String(a).trim() !== String(b).trim()
  }

  const diff = Math.abs(numA - numB)

  if (ruleType === 'percentage') {
    const base = Math.max(Math.abs(numA), Math.abs(numB))
    if (base === 0) return false
    return diff / base > ruleValue.threshold
  }

  if (ruleType === 'absolute') {
    return diff > ruleValue.threshold
  }

  return String(a).trim() !== String(b).trim()
}

// ─── 重大度判定 ─────────────────────────────────────────────────────

const FATAL_FIELDS = new Set(['hs_code', 'country_of_origin', 'total_amount'])

function getSeverity(fieldName: string): 'FATAL' | 'MINOR' {
  return FATAL_FIELDS.has(fieldName) ? 'FATAL' : 'MINOR'
}

// ─── ルールエンジン本体 ──────────────────────────────────────────────

/**
 * 抽出済みデータを受け取り、差異リストを返す
 * ToleranceRule は DB から取得する（テスト時はモック可）
 */
export async function runRuleEngine(
  docs: ExtractedDocuments,
  toleranceRules?: Array<{ fieldName: string; ruleType: string; ruleValue: unknown }>
): Promise<DiscrepancyResult[]> {
  const rules = toleranceRules ?? await prisma.toleranceRule.findMany()
  const ruleMap = new Map(rules.map(r => [r.fieldName, r]))

  const getRule = (fieldName: string) =>
    ruleMap.get(fieldName) ?? { ruleType: 'exact', ruleValue: {} }

  const discrepancies: DiscrepancyResult[] = []

  function check(
    fieldName: string,
    valueA: string | number | null | undefined,
    valueB: string | number | null | undefined,
    docA: DiscrepancyResult['docA'],
    docB: DiscrepancyResult['docB']
  ) {
    const rule = getRule(fieldName)
    if (compareValues(valueA, valueB, rule.ruleType, rule.ruleValue as Record<string, number>)) {
      discrepancies.push({
        fieldName,
        docA,
        docB,
        valueA: valueA !== null && valueA !== undefined ? String(valueA) : 'null',
        valueB: valueB !== null && valueB !== undefined ? String(valueB) : 'null',
        severity: getSeverity(fieldName),
      })
    }
  }

  const inv = docs.INVOICE
  const pl = docs.PACKING_LIST
  const bl = docs.BL
  const oc = docs.ORIGIN_CERT

  // INVOICE × PACKING_LIST
  if (inv && pl) {
    const invItem = inv.items?.[0]
    const plItem = pl.items?.[0]
    if (invItem && plItem) {
      check('description', invItem.description, plItem.description, 'INVOICE', 'PACKING_LIST')
      check('quantity', invItem.quantity, plItem.quantity, 'INVOICE', 'PACKING_LIST')
      check('total_gross_weight_kg', inv.total_amount, pl.total_gross_weight_kg, 'INVOICE', 'PACKING_LIST')
    }
  }

  // INVOICE × BL
  if (inv && bl) {
    check('supplier_name', inv.supplier_name, bl.shipper_name, 'INVOICE', 'BL')
    check('total_gross_weight_kg', pl?.total_gross_weight_kg, bl.total_gross_weight_kg, 'INVOICE', 'BL')
    check('total_volume_m3', pl?.total_volume_m3, bl.total_volume_m3, 'INVOICE', 'BL')
  }

  // INVOICE × ORIGIN_CERT
  if (inv && oc) {
    const invItem = inv.items?.[0]
    const ocItem = oc.items?.[0]
    if (invItem && ocItem) {
      check('hs_code', invItem.hs_code, ocItem.hs_code, 'INVOICE', 'ORIGIN_CERT')
      check('country_of_origin', invItem.country_of_origin, ocItem.country_of_origin, 'INVOICE', 'ORIGIN_CERT')
      check('description', invItem.description, ocItem.description, 'INVOICE', 'ORIGIN_CERT')
    }
  }

  // BL × PACKING_LIST
  if (bl && pl) {
    check('total_gross_weight_kg', bl.total_gross_weight_kg, pl.total_gross_weight_kg, 'BL', 'PACKING_LIST')
    check('total_volume_m3', bl.total_volume_m3, pl.total_volume_m3, 'BL', 'PACKING_LIST')
    check('total_cartons', bl.items?.[0]?.quantity, pl.total_cartons, 'BL', 'PACKING_LIST')
  }

  return discrepancies
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
pnpm test
```

Expected: `rule-engine.test.ts` の全テスト PASS。`compareValues` と `runRuleEngine` の基本ケースが全て緑。

- [ ] **Step 6: Commit**

```bash
git add lib/rule-engine.ts lib/__tests__/rule-engine.test.ts
git commit -m "feat: implement rule engine with TDD (compareValues + runRuleEngine)"
```

---

## Task 7: Claude 抽出ロジック

**Files:**
- Create: `lib/extractor.ts`, `lib/__tests__/extractor.test.ts`

- [ ] **Step 1: extractor テストを書く**

```typescript
// lib/__tests__/extractor.test.ts
import { describe, it, expect } from 'vitest'
import { parseClaudeResponse } from '../extractor'

describe('parseClaudeResponse', () => {
  it('正常な JSON 文字列をパースできる', () => {
    const raw = '{"invoice_number": "INV-001", "total_amount": 1000}'
    expect(parseClaudeResponse(raw)).toEqual({ invoice_number: 'INV-001', total_amount: 1000 })
  })

  it('マークダウンコードブロックを除去してパースできる', () => {
    const raw = '```json\n{"invoice_number": "INV-001"}\n```'
    expect(parseClaudeResponse(raw)).toEqual({ invoice_number: 'INV-001' })
  })

  it('不正な JSON の場合は null を返す', () => {
    expect(parseClaudeResponse('not json')).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm test
```

Expected: `Cannot find module '../extractor'` エラー。

- [ ] **Step 3: extractor.ts を実装**

```typescript
// lib/extractor.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-sonnet-4-20250514'

// ─── Prompt 定義 ──────────────────────────────────────────────────────

const PROMPTS: Record<string, string> = {
  INVOICE: `あなたは貿易文書のデータ抽出専門家です。
添付のInvoice（請求書）から以下の項目を抽出してください。
抽出項目：
- supplier_name: 発行元（サプライヤー）名
- consignee_name: 受取人名
- invoice_number: Invoice番号
- invoice_date: 発行日（YYYY-MM-DD形式）
- items: 商品リスト（配列）
  - description, hs_code, quantity, unit, unit_price, amount, country_of_origin
- total_amount: 合計金額
- currency: 通貨
- incoterm: インコタームズ
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,

  PACKING_LIST: `あなたは貿易文書のデータ抽出専門家です。
添付のPacking List（梱包明細書）から以下の項目を抽出してください。
抽出項目：
- supplier_name, consignee_name, pl_number, pl_date
- items: 配列（description, quantity, unit, gross_weight_kg, net_weight_kg, volume_m3, cartons）
- total_gross_weight_kg, total_net_weight_kg, total_volume_m3, total_cartons
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,

  BL: `あなたは貿易文書のデータ抽出専門家です。
添付のBill of Lading（船荷証券）から以下の項目を抽出してください。
抽出項目：
- bl_number, bl_date, shipper_name, consignee_name, notify_party
- vessel_name, voyage_number, port_of_loading, port_of_discharge, place_of_delivery
- items: 配列（description, quantity, gross_weight_kg, volume_m3）
- total_gross_weight_kg, total_volume_m3, freight_amount, freight_currency, freight_type
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,

  ORIGIN_CERT: `あなたは貿易文書のデータ抽出専門家です。
添付の原産地証明書（Certificate of Origin / DUCA）から以下の項目を抽出してください。
抽出項目：
- cert_number, cert_date, exporter_name, importer_name
- items: 配列（line_number, description, hs_code, country_of_origin, quantity, unit, gross_weight_kg, transaction_value）
- total_gross_weight_kg, total_transaction_value, issuing_authority
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,
}

// ─── レスポンスパーサー ────────────────────────────────────────────────

export function parseClaudeResponse(raw: string): Record<string, unknown> | null {
  try {
    // マークダウンコードブロックを除去
    const cleaned = raw
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ─── 抽出関数 ─────────────────────────────────────────────────────────

/**
 * テキストコンテンツから構造化データを抽出する（PDF文字層・Excel・Email）
 */
export async function extractFromText(
  docType: string,
  text: string
): Promise<{ data: Record<string, unknown> | null; rawResponse: string }> {
  const prompt = PROMPTS[docType]
  if (!prompt) throw new Error(`Unknown docType: ${docType}`)

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'text', text: `\n\n---\n\n${text}` },
        ],
      },
    ],
  })

  const rawResponse = response.content[0].type === 'text' ? response.content[0].text : ''
  const data = parseClaudeResponse(rawResponse)
  return { data, rawResponse }
}

/**
 * 画像（スキャン版PDF）から構造化データを抽出する
 */
export async function extractFromImages(
  docType: string,
  base64Images: string[]
): Promise<{ data: Record<string, unknown> | null; rawResponse: string }> {
  const prompt = PROMPTS[docType]
  if (!prompt) throw new Error(`Unknown docType: ${docType}`)

  const imageContent = base64Images.map(b64 => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: b64,
    },
  }))

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  const rawResponse = response.content[0].type === 'text' ? response.content[0].text : ''
  const data = parseClaudeResponse(rawResponse)
  return { data, rawResponse }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
pnpm test
```

Expected: `extractor.test.ts` の全テスト PASS（`parseClaudeResponse` 3ケース）。

- [ ] **Step 5: Commit**

```bash
git add lib/extractor.ts lib/__tests__/extractor.test.ts
git commit -m "feat: implement Claude field extractor with 4 document type prompts"
```

---

## Task 8: Claude 修正指示生成（lib/claude.ts）

**Files:**
- Create: `lib/claude.ts`

- [ ] **Step 1: claude.ts を作成**

```typescript
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import type { DiscrepancyResult } from './rule-engine'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-sonnet-4-20250514'

/**
 * 差異リストをもとに修正指示を生成する。
 * 戻り値は discrepancies と同じ順序の修正指示文字列配列。
 */
export async function generateCorrectionNotes(
  discrepancies: DiscrepancyResult[]
): Promise<string[]> {
  if (discrepancies.length === 0) return []

  const discrepanciesJson = JSON.stringify(
    discrepancies.map((d, i) => ({
      id: i,
      fieldName: d.fieldName,
      docA: d.docA,
      docB: d.docB,
      valueA: d.valueA,
      valueB: d.valueB,
      severity: d.severity,
    })),
    null,
    2
  )

  const prompt = `あなたは貿易書類の専門家です。
以下の差異情報をもとに、担当者が即座に対応できる修正指示を日本語で生成してください。

差異データ：
${discrepanciesJson}

各差異について以下を含む修正指示をJSON配列で返してください。
フォーマット：
[
  {
    "id": 0,
    "instruction": "差異の内容、影響、具体的な修正手順、優先度（FATAL/MINOR）を含む簡潔な修正指示"
  },
  ...
]

必ずJSON配列のみで返答してください。マークダウンのコードブロックや説明文は不要です。`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed: Array<{ id: number; instruction: string }> = JSON.parse(cleaned)
    // id 順に並べ替えて instruction のみ返す
    return discrepancies.map((_, i) => {
      const found = parsed.find(p => p.id === i)
      return found?.instruction ?? '修正指示の生成に失敗しました。'
    })
  } catch {
    return discrepancies.map(() => '修正指示の生成に失敗しました。')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/claude.ts
git commit -m "feat: add Claude correction note generator for discrepancies"
```

---

## Task 9: Shipments API Routes

**Files:**
- Create: `app/api/shipments/route.ts`, `app/api/shipments/[id]/route.ts`, `app/api/shipments/[id]/discrepancies/[did]/route.ts`

- [ ] **Step 1: GET/POST /api/shipments を作成**

```typescript
// app/api/shipments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const shipments = await prisma.shipment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { discrepancies: true } },
        discrepancies: { select: { severity: true } },
      },
    })
    return NextResponse.json(shipments)
  } catch (error) {
    console.error('[GET /api/shipments]', error)
    return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const shipment = await prisma.shipment.create({
      data: { name: name.trim() },
    })
    return NextResponse.json(shipment, { status: 201 })
  } catch (error) {
    console.error('[POST /api/shipments]', error)
    return NextResponse.json({ error: 'Failed to create shipment' }, { status: 500 })
  }
}
```

- [ ] **Step 2: GET /api/shipments/[id] を作成**

```typescript
// app/api/shipments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: params.id },
      include: {
        documents: { orderBy: { createdAt: 'asc' } },
        discrepancies: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }
    return NextResponse.json(shipment)
  } catch (error) {
    console.error('[GET /api/shipments/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch shipment' }, { status: 500 })
  }
}
```

- [ ] **Step 3: PATCH /api/shipments/[id]/discrepancies/[did] を作成**

```typescript
// app/api/shipments/[id]/discrepancies/[did]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; did: string } }
) {
  try {
    const { status } = await request.json()
    if (status !== 'OPEN' && status !== 'RESOLVED') {
      return NextResponse.json({ error: 'status must be OPEN or RESOLVED' }, { status: 400 })
    }
    const discrepancy = await prisma.discrepancy.update({
      where: { id: params.did, shipmentId: params.id },
      data: { status },
    })
    return NextResponse.json(discrepancy)
  } catch (error) {
    console.error('[PATCH discrepancy]', error)
    return NextResponse.json({ error: 'Failed to update discrepancy' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/shipments/
git commit -m "feat: add shipments and discrepancies API routes"
```

---

## Task 10: ファイルアップロード API

**Files:**
- Create: `app/api/documents/upload/route.ts`

- [ ] **Step 1: アップロード API を作成**

```typescript
// app/api/documents/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import type { DocType, FileType } from '@prisma/client'

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.eml', '.msg'])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const shipmentId = formData.get('shipmentId') as string | null
    const docType = formData.get('docType') as DocType | null

    if (!file || !shipmentId || !docType) {
      return NextResponse.json({ error: 'file, shipmentId, docType are required' }, { status: 400 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 })
    }

    // ファイル保存
    const uploadsDir = path.join(process.cwd(), 'uploads', shipmentId)
    await mkdir(uploadsDir, { recursive: true })
    const filename = `${docType}${ext}`
    const filePath = path.join(uploadsDir, filename)
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    // FileType 判定
    let fileType: FileType
    if (ext === '.xlsx' || ext === '.xls') {
      fileType = 'EXCEL'
    } else if (ext === '.eml' || ext === '.msg') {
      fileType = 'EMAIL'
    } else {
      // PDF: Python サービスで自動判定
      const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001'
      try {
        const blob = new Blob([bytes])
        const fd = new FormData()
        fd.append('file', blob, filename)
        const res = await fetch(`${pythonUrl}/process/pdf-auto`, { method: 'POST', body: fd })
        const result = await res.json() as { text?: string; images?: string[] }
        fileType = (result.images && result.images.length > 0) ? 'PDF_SCAN' : 'PDF_TEXT'
      } catch {
        fileType = 'PDF_TEXT' // フォールバック
      }
    }

    const document = await prisma.document.upsert({
      where: {
        // 同一 Shipment・同一 docType は上書き
        shipmentId_docType: { shipmentId, docType },
      } as never, // Prismaが複合UQを生成するまでの暫定
      update: { filePath: `uploads/${shipmentId}/${filename}`, fileType, status: 'PENDING', extractedData: null },
      create: { shipmentId, docType, fileType, filePath: `uploads/${shipmentId}/${filename}` },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents/upload]', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
```

> **注意:** Prisma のアップサートで複合ユニークキーを使うには `schema.prisma` の `Document` モデルに `@@unique([shipmentId, docType])` を追加する。追加後に `pnpm dlx prisma migrate dev --name add-document-unique` を実行。

- [ ] **Step 2: prisma/schema.prisma の Document モデルに複合UKを追加**

`Document` モデルの最後の行（`}`の前）に追加：
```prisma
  @@unique([shipmentId, docType])
```

- [ ] **Step 3: マイグレーション実行**

```bash
pnpm dlx prisma migrate dev --name add-document-unique
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: アップロード API のコードから `as never` を削除して修正**

`schema.prisma` 更新後、Prisma Client が再生成されるので `where` の型が解決される。`app/api/documents/upload/route.ts` の upsert の `where` を以下に修正：

```typescript
    const document = await prisma.document.upsert({
      where: { shipmentId_docType: { shipmentId, docType } },
      update: { filePath: `uploads/${shipmentId}/${filename}`, fileType, status: 'PENDING', extractedData: null },
      create: { shipmentId, docType, fileType, filePath: `uploads/${shipmentId}/${filename}` },
    })
```

- [ ] **Step 5: Commit**

```bash
git add app/api/documents/ prisma/
git commit -m "feat: add file upload API with auto PDF type detection"
```

---

## Task 11: 処理実行 API（オーケストレーション）

**Files:**
- Create: `app/api/process/[shipmentId]/route.ts`

- [ ] **Step 1: process API を作成**

```typescript
// app/api/process/[shipmentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { extractFromText, extractFromImages } from '@/lib/extractor'
import { runRuleEngine } from '@/lib/rule-engine'
import { generateCorrectionNotes } from '@/lib/claude'
import type { DocType } from '@prisma/client'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001'

async function preprocessFile(
  filePath: string,
  fileType: string
): Promise<{ text: string; images: string[] }> {
  const absPath = path.join(process.cwd(), filePath)
  const bytes = await readFile(absPath)
  const blob = new Blob([bytes])
  const fd = new FormData()
  fd.append('file', blob, path.basename(filePath))

  let endpoint = '/process/pdf-text'
  if (fileType === 'PDF_SCAN') endpoint = '/process/pdf-scan'
  else if (fileType === 'EXCEL') endpoint = '/process/excel'
  else if (fileType === 'EMAIL') endpoint = '/process/email'

  const res = await fetch(`${PYTHON_URL}${endpoint}`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Python service error: ${res.status}`)
  return res.json() as Promise<{ text: string; images: string[] }>
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { shipmentId: string } }
) {
  const { shipmentId } = params

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: true },
  })
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })

  await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'PROCESSING' } })

  try {
    // Step 1: 各ドキュメントを並列処理
    const results = await Promise.allSettled(
      shipment.documents.map(async (doc) => {
        await prisma.document.update({ where: { id: doc.id }, data: { status: 'PROCESSING' } })
        try {
          const preprocessed = await preprocessFile(doc.filePath, doc.fileType)
          let extractResult: { data: Record<string, unknown> | null }
          if (preprocessed.images.length > 0) {
            extractResult = await extractFromImages(doc.docType, preprocessed.images)
          } else {
            extractResult = await extractFromText(doc.docType, preprocessed.text)
          }
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              status: 'DONE',
              extractedData: extractResult.data ?? {},
              confidenceScore: extractResult.data ? 0.9 : 0.1,
            },
          })
          return { docType: doc.docType, data: extractResult.data }
        } catch (err) {
          await prisma.document.update({ where: { id: doc.id }, data: { status: 'ERROR' } })
          throw err
        }
      })
    )

    // Step 2: 抽出データを収集
    const extractedMap: Record<string, Record<string, unknown> | null> = {}
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        extractedMap[result.value.docType] = result.value.data
      }
    }

    // Step 3: 規則エンジン実行
    const discrepancyResults = await runRuleEngine(extractedMap as never)

    // Step 4: 修正指示生成
    const correctionNotes = await generateCorrectionNotes(discrepancyResults)

    // Step 5: 差異を DB に保存
    await prisma.discrepancy.deleteMany({ where: { shipmentId } })
    if (discrepancyResults.length > 0) {
      await prisma.discrepancy.createMany({
        data: discrepancyResults.map((d, i) => ({
          shipmentId,
          fieldName: d.fieldName,
          docA: d.docA as DocType,
          docB: d.docB as DocType,
          valueA: d.valueA,
          valueB: d.valueB,
          severity: d.severity,
          correctionNote: correctionNotes[i] ?? null,
        })),
      })
    }

    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'DONE' } })
    return NextResponse.json({ success: true, discrepancyCount: discrepancyResults.length })

  } catch (error) {
    console.error('[POST /api/process]', error)
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'ERROR' } })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/process/
git commit -m "feat: add processing orchestration API (preprocess → extract → rule engine → correction notes)"
```

---

## Task 12: エクスポート API

**Files:**
- Create: `app/api/export/[shipmentId]/route.ts`

- [ ] **Step 1: エクスポート API を作成**

```typescript
// app/api/export/[shipmentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { shipmentId: string } }
) {
  const format = request.nextUrl.searchParams.get('format') ?? 'json'

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: params.shipmentId },
      include: {
        documents: true,
        discrepancies: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (format === 'csv') {
      const headers = ['fieldName', 'docA', 'docB', 'valueA', 'valueB', 'severity', 'status', 'correctionNote']
      const rows = shipment.discrepancies.map(d =>
        headers.map(h => {
          const val = (d as Record<string, unknown>)[h]
          const str = val !== null && val !== undefined ? String(val) : ''
          return `"${str.replace(/"/g, '""')}"`
        }).join(',')
      )
      const csv = [headers.join(','), ...rows].join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="shipment-${params.shipmentId}.csv"`,
        },
      })
    }

    return NextResponse.json(shipment, {
      headers: {
        'Content-Disposition': `attachment; filename="shipment-${params.shipmentId}.json"`,
      },
    })
  } catch (error) {
    console.error('[GET /api/export]', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/export/
git commit -m "feat: add export API for JSON and CSV download"
```

---

## Task 13: 共用コンポーネント

**Files:**
- Create: `components/upload-zone.tsx`, `components/status-badge.tsx`, `components/discrepancy-list.tsx`, `components/extracted-json-dialog.tsx`

- [ ] **Step 1: ステータスバッジを作成**

```typescript
// components/status-badge.tsx
'use client'
import { Badge } from '@/components/ui/badge'

type Status = 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR'

const statusConfig: Record<Status, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  PENDING:    { label: '待機中',   variant: 'secondary' },
  PROCESSING: { label: '処理中',   variant: 'default'   },
  DONE:       { label: '完了',     variant: 'outline'   },
  ERROR:      { label: 'エラー',   variant: 'destructive' },
}

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? statusConfig.PENDING
  return <Badge variant={config.variant}>{config.label}</Badge>
}
```

- [ ] **Step 2: アップロードゾーンを作成**

```typescript
// components/upload-zone.tsx
'use client'
import { useRef, useState } from 'react'
import { Card } from '@/components/ui/card'

interface UploadZoneProps {
  docType: 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
  label: string
  onFileSelect: (file: File) => void
}

const docTypeLabels: Record<string, string> = {
  INVOICE: 'Invoice（請求書）',
  PACKING_LIST: 'Packing List（梱包明細）',
  BL: 'Bill of Lading（船荷証券）',
  ORIGIN_CERT: '原産地証明書',
}

export function UploadZone({ docType, label, onFileSelect }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = (file: File) => {
    setFileName(file.name)
    onFileSelect(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <Card
      className={`p-4 border-2 border-dashed cursor-pointer transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : fileName ? 'border-green-500 bg-green-50' : 'border-gray-300'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.xlsx,.xls,.eml"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <div className="text-center">
        <p className="font-medium text-sm">{docTypeLabels[docType] ?? label}</p>
        {fileName ? (
          <p className="text-green-600 text-xs mt-1 truncate">{fileName}</p>
        ) : (
          <p className="text-gray-400 text-xs mt-1">クリックまたはドラッグ＆ドロップ</p>
        )}
      </div>
    </Card>
  )
}
```

- [ ] **Step 3: JSON表示ダイアログを作成**

```typescript
// components/extracted-json-dialog.tsx
'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function ExtractedJsonDialog({
  docType,
  data,
}: {
  docType: string
  data: unknown
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">抽出結果を見る</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{docType} 抽出データ</DialogTitle>
        </DialogHeader>
        <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 差異リストコンポーネントを作成**

```typescript
// components/discrepancy-list.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Discrepancy {
  id: string
  fieldName: string
  docA: string
  docB: string
  valueA: string
  valueB: string
  severity: 'FATAL' | 'MINOR'
  correctionNote: string | null
  status: 'OPEN' | 'RESOLVED'
}

export function DiscrepancyList({
  discrepancies,
  shipmentId,
}: {
  discrepancies: Discrepancy[]
  shipmentId: string
}) {
  const [items, setItems] = useState(discrepancies)

  const toggleStatus = async (did: string, current: 'OPEN' | 'RESOLVED') => {
    const next = current === 'OPEN' ? 'RESOLVED' : 'OPEN'
    const res = await fetch(`/api/shipments/${shipmentId}/discrepancies/${did}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === did ? { ...i, status: next } : i))
    }
  }

  if (items.length === 0) {
    return <p className="text-green-600 text-sm">差異は検出されませんでした ✓</p>
  }

  return (
    <div className="space-y-3">
      {items.map((d) => (
        <div
          key={d.id}
          className={`border-l-4 p-4 rounded-r bg-white shadow-sm ${
            d.severity === 'FATAL' ? 'border-red-500' : 'border-yellow-400'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant={d.severity === 'FATAL' ? 'destructive' : 'secondary'}>
                {d.severity}
              </Badge>
              <span className="font-mono text-sm font-semibold">{d.fieldName}</span>
              <span className="text-gray-500 text-xs">{d.docA} × {d.docB}</span>
            </div>
            <Button
              size="sm"
              variant={d.status === 'RESOLVED' ? 'outline' : 'default'}
              onClick={() => toggleStatus(d.id, d.status)}
            >
              {d.status === 'RESOLVED' ? '再オープン' : '解決済みにする'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm mb-2">
            <div className="bg-red-50 p-2 rounded">
              <span className="text-xs text-gray-500">{d.docA}</span>
              <p className="font-medium">{d.valueA}</p>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <span className="text-xs text-gray-500">{d.docB}</span>
              <p className="font-medium">{d.valueB}</p>
            </div>
          </div>
          {d.correctionNote && (
            <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{d.correctionNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/upload-zone.tsx components/status-badge.tsx components/discrepancy-list.tsx components/extracted-json-dialog.tsx
git commit -m "feat: add shared UI components (UploadZone, StatusBadge, DiscrepancyList, ExtractedJsonDialog)"
```

---

## Task 14: レイアウトと首页（アップロードUI）

**Files:**
- Create: `app/layout.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`

- [ ] **Step 1: Root layout を更新**

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? 'Trade Document Checker',
  description: '貿易書類AI核対システム',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Dashboard layout を作成**

```typescript
// app/(dashboard)/layout.tsx
import Link from 'next/link'
import { Separator } from '@/components/ui/separator'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-bold text-lg">📦 Trade Checker</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-gray-600 hover:text-black">アップロード</Link>
            <Link href="/shipments" className="text-gray-600 hover:text-black">バッチ一覧</Link>
            <Link href="/export" className="text-gray-600 hover:text-black">エクスポート</Link>
          </nav>
        </div>
      </header>
      <Separator />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: 首页（アップロードページ）を作成**

```typescript
// app/(dashboard)/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UploadZone } from '@/components/upload-zone'

type DocType = 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'

const DOC_TYPES: DocType[] = ['INVOICE', 'PACKING_LIST', 'BL', 'ORIGIN_CERT']

export default function HomePage() {
  const router = useRouter()
  const [batchName, setBatchName] = useState('')
  const [files, setFiles] = useState<Partial<Record<DocType, File>>>({})
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)

  const allUploaded = DOC_TYPES.every(t => files[t])

  const handleFileSelect = (docType: DocType, file: File) => {
    setFiles(prev => ({ ...prev, [docType]: file }))
  }

  const handleSubmit = async () => {
    if (!batchName.trim() || !allUploaded) return
    setProcessing(true)
    setError(null)

    try {
      // 1. バッチ作成
      setStep('バッチを作成中…')
      const shipmentRes = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: batchName }),
      })
      if (!shipmentRes.ok) throw new Error('バッチ作成に失敗しました')
      const shipment = await shipmentRes.json() as { id: string }

      // 2. ファイルアップロード
      setStep('ファイルをアップロード中…')
      for (const docType of DOC_TYPES) {
        const file = files[docType]!
        const fd = new FormData()
        fd.append('file', file)
        fd.append('shipmentId', shipment.id)
        fd.append('docType', docType)
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(`${docType} のアップロードに失敗しました`)
      }

      // 3. 処理実行
      setStep('AIが書類を分析中…（しばらくお待ちください）')
      const processRes = await fetch(`/api/process/${shipment.id}`, { method: 'POST' })
      if (!processRes.ok) throw new Error('処理に失敗しました')

      router.push(`/shipments/${shipment.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました')
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>新規バッチ作成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="batch-name">バッチ名</Label>
            <Input
              id="batch-name"
              placeholder="例：2024-01 ABC Corp 輸入便"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              disabled={processing}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {DOC_TYPES.map(docType => (
              <UploadZone
                key={docType}
                docType={docType}
                label={docType}
                onFileSelect={(file) => handleFileSelect(docType, file)}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>
          )}

          {processing && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
              <p className="text-sm text-gray-600">{step}</p>
            </div>
          )}

          <Button
            className="w-full"
            disabled={!batchName.trim() || !allUploaded || processing}
            onClick={handleSubmit}
          >
            処理を開始する
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: 開発サーバーで動作確認**

```bash
pnpm dev
```

ブラウザで `http://localhost:3000` を開く。バッチ名入力と4つのアップロードゾーンが表示されることを確認。

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx "app/(dashboard)/"
git commit -m "feat: add dashboard layout and file upload homepage"
```

---

## Task 15: バッチ一覧ページ

**Files:**
- Create: `app/(dashboard)/shipments/page.tsx`

- [ ] **Step 1: バッチ一覧ページを作成**

```typescript
// app/(dashboard)/shipments/page.tsx
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import type { ShipmentStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface ShipmentWithStats {
  id: string
  name: string
  status: ShipmentStatus
  createdAt: Date
  discrepancies: Array<{ severity: string }>
}

export default async function ShipmentsPage() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { discrepancies: { select: { severity: true } } },
  }) as ShipmentWithStats[]

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">バッチ一覧</h1>
        <Button asChild>
          <Link href="/">新規作成</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>バッチ名</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead className="text-red-600">FATAL</TableHead>
            <TableHead className="text-yellow-600">MINOR</TableHead>
            <TableHead>作成日時</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.map((s) => {
            const fatalCount = s.discrepancies.filter(d => d.severity === 'FATAL').length
            const minorCount = s.discrepancies.filter(d => d.severity === 'MINOR').length
            return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell>
                  {fatalCount > 0 ? (
                    <span className="text-red-600 font-bold">{fatalCount}</span>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  {minorCount > 0 ? (
                    <span className="text-yellow-600 font-bold">{minorCount}</span>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {new Date(s.createdAt).toLocaleString('ja-JP')}
                </TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/shipments/${s.id}`}>詳細</Link>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
          {shipments.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                バッチがありません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/shipments/page.tsx"
git commit -m "feat: add shipments list page with FATAL/MINOR counts"
```

---

## Task 16: バッチ詳細ページ

**Files:**
- Create: `app/(dashboard)/shipments/[id]/page.tsx`

- [ ] **Step 1: バッチ詳細ページを作成**

```typescript
// app/(dashboard)/shipments/[id]/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { ExtractedJsonDialog } from '@/components/extracted-json-dialog'
import { DiscrepancyList } from '@/components/discrepancy-list'
import type { DocType, DocStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  INVOICE: 'Invoice',
  PACKING_LIST: 'Packing List',
  BL: 'Bill of Lading',
  ORIGIN_CERT: '原産地証明書',
}

export default async function ShipmentDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: params.id },
    include: {
      documents: { orderBy: { createdAt: 'asc' } },
      discrepancies: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
    },
  })
  if (!shipment) notFound()

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{shipment.name}</h1>
        <StatusBadge status={shipment.status} />
      </div>

      {/* 書類カード */}
      <section>
        <h2 className="text-lg font-semibold mb-3">アップロード書類</h2>
        <div className="grid grid-cols-2 gap-4">
          {(['INVOICE', 'PACKING_LIST', 'BL', 'ORIGIN_CERT'] as DocType[]).map((docType) => {
            const doc = shipment.documents.find(d => d.docType === docType)
            return (
              <Card key={docType}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex justify-between items-center">
                    {DOC_TYPE_LABELS[docType]}
                    {doc && <StatusBadge status={doc.status as DocStatus} />}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {doc ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">{doc.fileType}</p>
                      {doc.extractedData && (
                        <ExtractedJsonDialog
                          docType={DOC_TYPE_LABELS[docType]}
                          data={doc.extractedData}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">未アップロード</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* 差異リスト */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          差異レポート
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({shipment.discrepancies.length} 件)
          </span>
        </h2>
        <DiscrepancyList
          discrepancies={shipment.discrepancies.map(d => ({
            ...d,
            correctionNote: d.correctionNote,
            status: d.status as 'OPEN' | 'RESOLVED',
            severity: d.severity as 'FATAL' | 'MINOR',
          }))}
          shipmentId={shipment.id}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/shipments/[id]/page.tsx"
git commit -m "feat: add shipment detail page with document cards and discrepancy list"
```

---

## Task 17: エクスポートページ

**Files:**
- Create: `app/(dashboard)/export/page.tsx`

- [ ] **Step 1: エクスポートページを作成**

```typescript
// app/(dashboard)/export/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'

interface Shipment { id: string; name: string }

export default function ExportPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    fetch('/api/shipments')
      .then(r => r.json())
      .then(data => setShipments(data as Shipment[]))
  }, [])

  const download = (format: 'json' | 'csv') => {
    if (!selectedId) return
    window.location.href = `/api/export/${selectedId}?format=${format}`
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">エクスポート</h1>
      <Card>
        <CardHeader>
          <CardTitle>バッチを選択してダウンロード</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>バッチ</Label>
            <Select onValueChange={setSelectedId} value={selectedId}>
              <SelectTrigger>
                <SelectValue placeholder="バッチを選択してください" />
              </SelectTrigger>
              <SelectContent>
                {shipments.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={!selectedId}
              onClick={() => download('json')}
            >
              JSON ダウンロード
            </Button>
            <Button
              variant="outline"
              disabled={!selectedId}
              onClick={() => download('csv')}
            >
              CSV ダウンロード
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled variant="secondary">
                      NASSC 連携
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>接口対接中（実装予定）</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/export/page.tsx"
git commit -m "feat: add export page with JSON/CSV download and NASSC placeholder"
```

---

## Task 18: README と最終確認

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md を作成**

```markdown
# Trade Document Checker（貿易書類AI核対システム）

## 概要

Invoice / Packing List / B/L / 原産地証明書の4種類の貿易書類をアップロードすると、
Claude Vision APIが各書類からフィールドを抽出し、規則エンジンが差異を検出、
LLMが修正指示を日本語で生成します。

## 技術スタック

- **フロントエンド/バックエンド**: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **データベース**: PostgreSQL 16 + Prisma ORM
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **ファイル前処理**: Python 3.11 + FastAPI + pdfplumber + pdf2image + openpyxl
- **インフラ**: Docker Compose

## 環境構築

### 前提条件

- Docker Desktop インストール済み
- Node.js 20+, pnpm インストール済み
- Anthropic API キー取得済み

### 手順

1. リポジトリをクローン

2. `.env.local` を作成：
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trade_checker"
   ANTHROPIC_API_KEY="your_api_key_here"
   PYTHON_SERVICE_URL="http://localhost:8001"
   NEXT_PUBLIC_APP_NAME="Trade Document Checker"
   ```

3. Docker Compose で起動：
   ```bash
   docker compose up -d
   ```

4. DBマイグレーションとシード：
   ```bash
   pnpm dlx prisma migrate deploy
   pnpm dlx prisma db seed
   ```

5. ブラウザで `http://localhost:3000` を開く

### ローカル開発（Docker不使用）

```bash
# PostgreSQL と Python サービスを別途起動した上で
pnpm install
pnpm dev
```

Python サービス単体起動：
```bash
cd python-service
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
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
```

- [ ] **Step 2: 全テストが通ることを確認**

```bash
pnpm test
```

Expected: 全テスト PASS（rule-engine + extractor）

- [ ] **Step 3: TypeScript エラーがないことを確認**

```bash
pnpm build 2>&1 | head -30
```

Expected: `✓ Compiled successfully` または警告のみ（エラーなし）

- [ ] **Step 4: 最終 Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
git tag v0.1.0
```

---

## 実装後チェックリスト

- [ ] `pnpm test` で全テスト PASS
- [ ] `pnpm build` でビルド成功
- [ ] `docker compose up` で3サービスが全て起動
- [ ] `http://localhost:8001/health` が `{"status":"ok"}` を返す
- [ ] `http://localhost:3000` でアップロード画面が表示される
- [ ] PDFアップロード→処理→差異レポート表示の一連フローが動作する
- [ ] JSON/CSVダウンロードが正しく機能する
