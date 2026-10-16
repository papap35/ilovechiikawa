# ilovechiikawa

吉伊卡哇（ちいかわ）玩偶收藏管理工具，含 AI 拍照鑑定、仿冒疑點檢查、行情估值與跨出處比較。

拍一張照片，辨識角色、出處（官方商店、夾娃娃機、一番賞…）、尺寸與狀態，
標出看起來可疑的地方，算出參考行情，然後存進收藏庫。估值是攤開來的——
每一項係數都會告訴你為什麼，而不是丟一個數字給你。

> 本專案由 [ilovetomica](https://github.com/papap35/ilovetomica)（1/64 合金車收藏工具）
> 擷取共用功能改寫而成：儲存層、AI 鑑定流程、可解釋估值、比較、統計、PWA 與備份都沿用同一套架構，
> 領域知識層換成玩偶收藏的語彙。

## 這個工具在乎什麼

一般的收藏管理 App 只讓你記「有哪些東西」。玩偶收藏的價值分歧點不在數量，
而在那些外人看不出來的細節，而且**每個出處的規矩都不一樣**：

- **出處決定行情。** 同一隻小八，官方常規款、夾娃娃機景品、一番賞上位賞，
  二手價可以差好幾倍。所以出處（通路）是估值的第一層。
- **「特別版」的概念因出處而異。** 一番賞是ラストワン賞（×2.5）、官方商店是抽選販售（×1.8）、
  聯名是非賣品贈品（×2）；地區限定與一般零售沒有這種概念。
- **仿冒風險因出處而異。** 夾娃娃機景品與一番賞大獎是仿冒重災區；官方商店直購的風險低很多。
  所以每個出處帶一個「仿冒敏感度」，用來縮放「未查證」的扣分。
- **照片證明不了正版。** 吊牌與做工都能仿，AI 最多只會給到「大致可信」，
  「已查證正版」要你核對過購買記錄或實物後自己勾。
- **吊牌要單獨評。** 未拆袋、吊牌完整、吊牌折損、無吊牌，價差可以到兩倍以上，
  而且沒有吊牌也讓查證變得困難。

這些判斷邏輯寫在 `src/lib/plush/` 底下，是這個專案的核心，而不是附屬設定檔。

## 功能

- **AI 拍照鑑定** — 用 Claude 的視覺能力先看吊牌定出處、再定產品線，辨認角色與尺寸，
  檢查仿冒疑點與狀態，回傳結構化結果與判斷依據
- **仿冒疑點** — 臉部刺繡比例、布料、縫線、吊牌印刷有可疑之處時逐條列出，並在收藏卡片上標示
- **可解釋的估值** — 產品線基準行情 × 稀有度 × 尺寸 × 正版查證 × 本體狀態 × 吊牌狀態 ×
  角色人氣 × 造型主題 × 特別版 × 停售年資，每一項都附理由
- **跨出處比較** — 選 2–4 隻並排比較，並自動算出「價差來自哪裡」：
  依造成的價差排序係數，相同的自動淡出
- **收藏庫** — 搜尋、角色／出處／稀有度篩選、估值排序、購入價與損益追蹤
- **統計儀表板** — 總估值與區間、成本、未實現損益、待查證隻數、角色／出處／稀有度分布
- **PWA** — 可安裝到手機主畫面，離線時收藏庫仍打得開
- **匯出／匯入** — 收藏庫隨時可完整下載備份，格式與伺服器端原生格式相同
- **Google 登入** — 任何 Google 帳號都能登入，每個人各自一份收藏庫，只看得到、改得到自己的
- **AI 鑑定額度** — 每人每天預設 10 次，用完仍可手動建檔，管理員不受限

## 快速開始

```bash
npm install
cp .env.example .env.local   # 填入 ANTHROPIC_API_KEY
npm run dev
```

打開 http://localhost:3000。

**沒有 API 金鑰也能跑**：辨識會進入「示範模式」，回傳一組固定的範例資料，
讓你先看完整個流程。畫面上會明確標示這不是真實辨識結果。

## 串接 AI

1. 到 [Anthropic Console](https://console.anthropic.com/settings/keys) 建立一支 API 金鑰
2. 在專案根目錄建立 `.env.local`：

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. 驗證它真的通：

   ```bash
   npm run verify:ai -- 正面.jpg 吊牌.jpg 布標.jpg
   ```

   會實際呼叫一次 Claude，印出完整辨識結果、仿冒疑點、估值明細，以及這次的 token
   用量與成本。成功會顯示「✓ AI 辨識可用」。

4. `npm run dev`，到 `/scan` 拍照鑑定。畫面上的「示範模式」提示消失，
   就代表走的是真實辨識。

用的是 `claude-opus-5-5` 搭配 structured output 與 adaptive thinking（effort 明確設為 `high`）。
另外開啟了伺服器端 fallback（`fallbacks: "default"`）：安全分類器偶爾誤擋正常照片時，
請求會在同一次呼叫內改由備援模型重跑，而不是直接失敗。
系統提示詞（通路目錄、角色目錄與判讀順序）標記為可快取，所以每次辨識只需要付新照片的錢。

## 指令

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 產出正式版本 |
| `npm start` | 執行正式版本 |
| `npm test` | 跑測試（Vitest） |
| `npm run verify:ai -- 照片.jpg` | 用真實 API 驗證辨識，印出結果與成本 |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm run lint` | ESLint |

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 無 | 未設定時辨識進入示範模式 |
| `GOOGLE_CLIENT_ID` | 無 | Google OAuth 用戶端 ID。**部署時必填**（見下方「設定 Google 登入」） |
| `GOOGLE_CLIENT_SECRET` | 無 | Google OAuth 用戶端密鑰。**部署時必填** |
| `AUTH_SECRET` | 無 | 簽章登入狀態的密鑰，至少 32 字元（`openssl rand -base64 32`）。**部署時必填**；換掉會讓所有人登出 |
| `CHIIKAWA_AI_DAILY_LIMIT` | `10` | AI 鑑定每人每天的次數上限，台灣時間午夜重置。`0` 代表只有管理員能用 |
| `CHIIKAWA_ADMIN_EMAILS` | 無 | 不受次數限制的 Google 帳號，以逗號分隔 |
| `CHIIKAWA_STORAGE` | 自動偵測 | `json`（本機檔案）或 `blob`（Vercel Blob）。不設定時看有沒有 `BLOB_READ_WRITE_TOKEN` 決定 |
| `CHIIKAWA_DATA_DIR` | `./data` | 本機檔案驅動的存放目錄 |
| `BLOB_READ_WRITE_TOKEN` | 無 | Vercel Blob 金鑰，在 Vercel 建立 Blob store 後自動注入 |
| `CHIIKAWA_JPY_TWD` | `0.21` | 日圓兌新台幣參考匯率 |

## 專案結構

```
src/
  lib/plush/        領域知識層（這個專案的核心）
    channels.ts       9 個出處：特別版概念、仿冒敏感度、會出現的尺寸、參考市場
    series.ts         16 條產品線與各自的基準行情
    characters.ts     角色目錄與人氣係數，以及造型主題規則（討伐、變裝、節慶…）
    grading.ts        稀有度、尺寸、正版查證、本體狀態、吊牌狀態的分級與係數
    valuation.ts      估值引擎，回傳可解釋的係數明細
    compare.ts        比較邏輯：屬性對照與「價差來自哪裡」
    stats.ts          收藏庫統計與損益
    schema.ts         Zod schema（收藏品）
  lib/ai/
    prompt.ts         鑑定用的系統提示詞，把判讀順序寫成檢查清單
    identify.ts       Claude Vision 呼叫（structured output + fallback）
    normalize.ts      寬容解析 + 出處／產品線正規化 + 正版判斷上限
    mock.ts           示範模式的範例資料
  lib/store/        收藏庫儲存層
    driver.ts         儲存驅動介面與衝突型別
    json-file-driver.ts   本機檔案（開發用）
    vercel-blob-driver.ts Vercel Blob（部署用，私有 + ETag 樂觀鎖）
  app/              Next.js App Router 頁面與 API
  components/       UI 元件
```

## 幾個實作上的取捨

**正版查證是一個係數，而且依出處縮放。** 吉伊卡哇玩偶的仿冒品非常多，二手買家對「沒查證過」
會直接壓價。但同樣是未查證，官方商店買的和夾娃娃機來路不明的風險不是同一回事，
所以扣分幅度乘上出處的 `authenticitySensitivity`。「確認仿冒」則不縮放——假貨在哪裡都是假貨。

**AI 不能給「已查證正版」。** 模型回傳 `verified` 時，`normalize.ts` 會降為「大致可信」並附上說明。
照片能看出疑點，但看不出真偽的最後一步；把那一步留給使用者，而不是讓估值假裝很有把握。
判斷不出查證狀態時一律當作「未查證」，絕不往正版那邊靠。

**尺寸是倍率，不是產品線。** 同一條產品線常常同時有吊飾、S、M、BIG，
所以基準行情以 S 尺寸為準，其他尺寸用倍率換算；每個出處只列它實際會出現的尺寸。

**收藏庫在概念上就是一份 JSON 文件，儲存位置抽象成驅動。** 本機開發寫檔案最方便；
但 Vercel 的 serverless 檔案系統是唯讀的，所以雲端改用 Vercel Blob。驅動介面只有
`read` / `write` 兩個方法，Blob 驅動用 ETag 做樂觀鎖，兩個分頁同時修改時不會互相蓋掉。

**辨識結果採寬容解析。** SDK 把 Zod enum 轉成 JSON schema 時會降級成 `type: "string"`，
可選值只寫進欄位描述，所以 `normalize.ts` 先把分類欄位當字串收下，再對應回標準分類；
對不上就退回保守值並在畫面上提醒複查。

**出處由產品線推導，不另外儲存。** 產品線代號已經隱含出處，存兩份只會讓它們有機會互相矛盾。

**系統提示詞刻意保持不變**，透過 prompt cache 快取起來，裡面不放時間戳或任何會變動的內容。

**照片在瀏覽器端先縮到長邊 1280px**，對辨識吊牌文字與刺繡細節已經夠用。

**Google 登入是自己實作的 OAuth（授權碼 + PKCE），沒有引入登入套件。** 流程只有三個 route
（`/api/auth/google`、`/api/auth/callback/google`、`/api/auth/logout`），全部有測試。
登入狀態是一個以 `AUTH_SECRET` 簽章的 cookie（使用者 id、email、名稱、到期時間），伺服器不存 session，
serverless 也適用。`src/proxy.ts` 在所有頁面與 API 之前檢查它；每個 route 與頁面再各自解一次使用者，
**讀誰的收藏庫一律由簽章過的 session 決定**，絕不從網址或 body 讀。正式環境沒設定時刻意**擋下所有請求**：
忘記設定的代價應該是「打不開」，而不是「整個網站公開在網路上」。

**每人一份收藏庫，但不需要資料庫。** 收藏庫本來就是一份 JSON 文件，多人只是變成每人一份：
`users/<id>/collection.json`。使用者 id 取自 Google 帳號的 `sub`（不用 email，改 email 不該讓收藏消失）。
個人收藏的規模下，Blob 每人一個檔案比架一個 Postgres 簡單得多；真的需要跨使用者查詢時再換。
本機開發不設定登入時，「本機使用者」沿用舊的 `data/collection.json`，既有收藏不會消失。

**AI 額度是「先預約、失敗再退還」。** 呼叫 API 之前就先把次數加上去，同時開十個分頁也不會超過上限；
辨識失敗、照片格式錯誤都不會吃掉次數。沒有 API 金鑰的示範模式不計額度。

## 部署

完整步驟見 [`docs/PLAN.md`](docs/PLAN.md)。

部署前務必做兩件事：

1. **建立 Blob store**（專案 → Storage → Create → Blob）。沒有 Blob 的話 app 會退回本機檔案驅動，收藏會存不進去。
2. **設定 Google 登入**（見下一節）。沒設定的話網站會拒絕所有請求（刻意的，避免收藏庫對外公開）。

部署後用 Google 登入、打開 `/settings`，確認「目前的儲存位置」顯示「Vercel Blob」，「帳號」顯示你的 Google 帳號。

### 設定 Google 登入

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立（或選一個）專案
2. **APIs & Services → OAuth consent screen**：User type 選 **External**，填 App name、支援 email；
   Scopes 只需要 `openid`、`email`、`profile`。測試沒問題後按 **Publish app**——
   停留在 Testing 狀態時，只有你手動加進 Test users 的帳號能登入
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**：類型選 **Web application**
4. **Authorized redirect URIs** 加上（網域換成你的）：
   - `https://你的網域/api/auth/callback/google`
   - 本機測試時另外加 `http://localhost:3000/api/auth/callback/google`
5. 把 Client ID 與 Client secret 填進 Vercel 的環境變數 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`，
   再用 `openssl rand -base64 32` 產生一組 `AUTH_SECRET`
6. 建議把自己的 email 填進 `CHIIKAWA_ADMIN_EMAILS`，自己用 AI 鑑定時不受每日次數限制
7. 重新部署

## 估值的可信度

估值是依產品線行情與各項係數推算的**參考值**，不是成交保證。`series.ts` 的基準行情、
`characters.ts` 的角色係數與 `grading.ts` 的各項係數都是估計值，集中在一處，
設計成可以依你自己在 Mercari「売り切れ」、駿河屋買取價觀察到的市場狀況調整——
測試會確保調整後的相對關係仍然合理。

## 聲明

本專案為個人收藏管理工具，與 ちいかわ 原作者及其授權商無任何關係。
角色名稱僅作事實性描述使用，專案內不含任何官方圖像。
