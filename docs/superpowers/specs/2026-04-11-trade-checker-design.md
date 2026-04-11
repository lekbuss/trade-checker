# 贸易文件AI核对系统 — 设计文档

**日期：** 2026-04-11  
**项目根目录：** `c:/Users/r00000835/Desktop/easy for docuware/`  
**状态：** 已审批，待实现

---

## 1. 项目概要

构建一个贸易文件自动核对系统。用户上传4种贸易文件（Invoice / Packing List / B/L / 原産地証明），系统用 Claude Vision API 抽取字段，规则引擎横向比对差异，LLM 生成自然语言修正指示，最终输出报告并推送 NASSC 系统（当前为占位符）。

---

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 前端 + 后端 | Next.js 14（App Router）+ Tailwind CSS + shadcn/ui |
| 数据库 | PostgreSQL 16 + Prisma ORM |
| AI | Anthropic Claude API（claude-sonnet-4-20250514，Vision支持） |
| 文件预处理 | Python FastAPI 微服务（端口 8001） |
| 语言 | TypeScript（前后端）+ Python 3.11（微服务） |
| 包管理 | pnpm |
| 基础设施 | Docker Compose（Next.js + Python + PostgreSQL） |

---

## 3. 系统架构

```
浏览器
  │
  ▼
Next.js 14 (App Router) — 端口 3000
  ├── /app/(dashboard)/          前端页面
  └── /app/api/                  API Routes（BFF层）
       │
       ├──► Python FastAPI — 端口 8001   （文件预处理）
       │       └── PDF文本提取 / 扫描版→base64 / Excel解析 / Email解析
       │
       ├──► Anthropic Claude API          （字段抽取 + 修正指示生成）
       │
       └──► PostgreSQL — 端口 5432        （数据持久化，Prisma ORM）
```

### Docker Compose 服务

| 服务 | 镜像 | 端口 |
|------|------|------|
| `nextjs` | node:20-alpine | 3000 |
| `python-service` | python:3.11-slim | 8001 |
| `postgres` | postgres:16 | 5432 |

---

## 4. 处理流程（同步方案）

```
1. 用户填写批次名 + 上传4份文件
2. POST /api/documents/upload
   → 文件存入 public/uploads/[shipmentId]/[docType].[ext]
   → 创建 Shipment + Document 记录
3. POST /api/process/[shipmentId]
   a. 调用 Python 微服务预处理各文件
      - PDF 可文字：pdfplumber → 纯文本
      - PDF 扫描版：pdf2image → base64 图像数组
      - Excel：openpyxl → 纯文本
      - Email：解析本文 + 附件
   b. Promise.all 并发调用 Claude API 抽取字段 × 4份
   c. 更新 Document.extractedData（JSON）+ confidenceScore
   d. 规则引擎比对 → 生成 Discrepancy 列表
   e. 调用 Claude 为每条差异生成修正指示（correctionNote）
   f. 更新 Shipment.status = DONE
4. 前端轮询 GET /api/shipments/[id]（每2秒，超时60秒）
```

---

## 5. 目录结构

```
easy for docuware/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                 # 首页：文件上传
│   │   ├── shipments/
│   │   │   ├── page.tsx             # 批次列表
│   │   │   └── [id]/
│   │   │       └── page.tsx         # 批次详情 + 差异报告
│   │   └── export/
│   │       └── page.tsx             # 导出页面
│   └── api/
│       ├── shipments/route.ts
│       ├── shipments/[id]/route.ts
│       ├── shipments/[id]/discrepancies/[did]/route.ts
│       ├── documents/upload/route.ts
│       ├── process/[shipmentId]/route.ts
│       └── export/[shipmentId]/route.ts
├── python-service/
│   ├── main.py
│   ├── processors/
│   │   ├── pdf_processor.py
│   │   ├── excel_processor.py
│   │   └── email_processor.py
│   └── requirements.txt
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── lib/
│   ├── claude.ts                    # Claude API封装
│   ├── extractor.ts                 # 字段抽取逻辑（4种文件类型Prompt）
│   ├── rule-engine.ts               # 规则引擎
│   └── nassc.ts                     # NASSC推送模块（占位符）
├── components/
│   └── ui/                          # shadcn/ui 组件
├── docker-compose.yml
├── Dockerfile                       # Next.js
├── python-service/Dockerfile
├── .env.example
├── .gitignore
└── README.md
```

---

## 6. 数据库 Schema（Prisma）

```prisma
model Shipment {
  id            String            @id @default(cuid())
  name          String
  status        ShipmentStatus    @default(PENDING)
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  documents     Document[]
  discrepancies Discrepancy[]
}

enum ShipmentStatus { PENDING PROCESSING DONE ERROR }

model Document {
  id              String     @id @default(cuid())
  shipmentId      String
  shipment        Shipment   @relation(fields: [shipmentId], references: [id])
  docType         DocType
  fileType        FileType
  filePath        String
  status          DocStatus  @default(PENDING)
  extractedData   Json?
  confidenceScore Float?
  createdAt       DateTime   @default(now())
}

enum DocType    { INVOICE PACKING_LIST BL ORIGIN_CERT }
enum FileType   { PDF_TEXT PDF_SCAN EXCEL EMAIL }
enum DocStatus  { PENDING PROCESSING DONE ERROR }

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

enum Severity          { FATAL MINOR }
enum DiscrepancyStatus { OPEN RESOLVED }

model ToleranceRule {
  id         String   @id @default(cuid())
  fieldName  String   @unique
  ruleType   String
  ruleValue  Json
  createdAt  DateTime @default(now())
}
```

### Seed 数据（prisma/seed.ts）

6条默认容许误差规则：

| fieldName | ruleType | threshold |
|-----------|----------|-----------|
| total_gross_weight_kg | percentage | 0.5% |
| total_volume_m3 | percentage | 1% |
| total_amount | percentage | 0.5% |
| quantity | absolute | 1 |
| hs_code | exact | — |
| country_of_origin | exact | — |

---

## 7. API Routes 规范

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/shipments` | 批次列表（含FATAL/MINOR差异数统计） |
| `POST` | `/api/shipments` | 创建批次 |
| `GET` | `/api/shipments/[id]` | 批次详情（含documents + discrepancies） |
| `POST` | `/api/documents/upload` | 上传文件（multipart/form-data） |
| `POST` | `/api/process/[shipmentId]` | 触发同步处理流程 |
| `PATCH` | `/api/shipments/[id]/discrepancies/[did]` | 更新差异状态 |
| `GET` | `/api/export/[shipmentId]` | 导出（`?format=json\|csv`） |

---

## 8. Python 微服务 API

**基础URL：** `http://localhost:8001`（Docker内为 `http://python-service:8001`）

| 方法 | 端点 | 功能 |
|------|------|------|
| `POST` | `/process/pdf-text` | pdfplumber文本提取 |
| `POST` | `/process/pdf-scan` | pdf2image转base64图像 |
| `POST` | `/process/excel` | openpyxl文本转换 |
| `POST` | `/process/email` | 邮件本文+附件解析 |
| `GET` | `/health` | 健康检查 |

**统一响应格式：**
```json
{
  "success": true,
  "text": "提取出的纯文本",
  "images": ["base64string..."]
}
```

---

## 9. Claude API 集成

### 字段抽取（lib/extractor.ts）

各文件类型使用专用 Prompt，要求返回纯 JSON（无 markdown 包裹）：

- **Invoice**：supplier_name, consignee_name, invoice_number, invoice_date, items[], total_amount, currency, incoterm
- **Packing List**：supplier_name, consignee_name, pl_number, pl_date, items[], total_gross_weight_kg, total_net_weight_kg, total_volume_m3, total_cartons
- **B/L**：bl_number, bl_date, shipper_name, consignee_name, notify_party, vessel_name, voyage_number, port_of_loading, port_of_discharge, items[], total_gross_weight_kg, total_volume_m3, freight_type
- **原産地証明**：cert_number, cert_date, exporter_name, importer_name, items[], total_gross_weight_kg, total_transaction_value, issuing_authority

### 修正指示生成（lib/claude.ts）

输入：差异列表 JSON  
输出：各差异的日语修正指示（差异内容 / 影响 / 具体修正步骤 / 优先度）

---

## 10. 规则引擎（lib/rule-engine.ts）

### 比较组合

| 文件对 | 比较字段 |
|--------|----------|
| INVOICE × PACKING_LIST | description, quantity, gross_weight_kg |
| INVOICE × BL | supplier_name/shipper_name, total_gross_weight_kg, total_volume_m3 |
| INVOICE × ORIGIN_CERT | hs_code, country_of_origin, description |
| BL × PACKING_LIST | total_gross_weight_kg, total_volume_m3, total_cartons/quantity |

### 严重度判定

- **FATAL**：hs_code不一致 / country_of_origin不一致 / 金额超容许误差
- **MINOR**：重量・容积在容许误差内 / 数量在容许误差内 / 商品描述表记差异

---

## 11. 前端页面设计

### 首页 `/`
- 批次名输入框
- 4个独立拖拽上传区（Invoice / Packing List / B/L / 原産地証明）
- 支持 PDF / Excel（.xlsx/.xls）
- 「开始处理」按钮（4个文件全部上传后激活）
- 处理中：全屏 loading overlay + 步骤文字

### 批次列表 `/shipments`
- 表格：批次名 / 状态徽章 / 创建时间 / FATAL数（红）/ MINOR数（黄）/ 操作
- 状态徽章：PENDING灰 / PROCESSING蓝 / DONE绿 / ERROR红

### 批次详情 `/shipments/[id]`
- 上半：4份文件卡片，含「查看抽取结果 JSON」Dialog
- 下半：差异列表，FATAL红色左边框 / MINOR黄色左边框，含修正指示 + OPEN/RESOLVED切换

### 导出页 `/export`
- 批次下拉选择
- 「下载 JSON」/ 「下载 CSV」按钮
- NASSC推送按钮（禁用，tooltip：「接口对接中」）

### shadcn/ui 组件使用
`Table`, `Badge`, `Card`, `Button`, `Input`, `Dialog`, `Tooltip`, `Select`, `Separator`

---

## 12. 环境变量

```env
DATABASE_URL="postgresql://user:password@localhost:5432/trade_checker"
ANTHROPIC_API_KEY="your_api_key_here"
PYTHON_SERVICE_URL="http://python-service:8001"
NEXT_PUBLIC_APP_NAME="Trade Document Checker"
```

---

## 13. NASSC 模块（占位符）

`lib/nassc.ts` 导出 `pushToNassc(shipmentId: string): Promise<void>`，当前实现仅记录日志，返回成功。接口规范确定后替换实现。

---

## 14. 错误处理策略

- 所有 API Route 使用 try/catch，返回标准 `{ error: string }` + HTTP 状态码
- Claude API 调用失败：Document.status = ERROR，继续处理其他文件
- Python 微服务不可达：返回 503，前端显示服务异常提示
- 处理超时（> 60秒）：Shipment.status = ERROR

---

## 15. 实装顺序

1. Next.js 项目初始化 + shadcn/ui 配置（pnpm）
2. Prisma Schema + Migration + Seed
3. Docker Compose + Dockerfile 配置
4. Python FastAPI 微服务
5. 文件上传 API（`/api/documents/upload`）
6. 首页上传 UI
7. Claude Vision 抽取逻辑（先实现 Invoice 一种，验证后扩展）
8. 批次列表页
9. 批次详情页
10. 规则引擎实装
11. LLM 修正指示生成
12. 导出功能（JSON/CSV）
13. NASSC 占位符模块
14. README + .gitignore + Git 初始化
