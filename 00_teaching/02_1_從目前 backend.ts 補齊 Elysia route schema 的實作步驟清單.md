---
noteId: "d108ec723ee211f185ead73ffc185340"
tags: []

---

# 從目前 backend.ts 補齊 Elysia route schema 的實作步驟清單

這份文件是 [02_0_API contract truth 的重要性與實作方式](</root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_0_API contract truth 的重要性與實作方式.md:1>) 的實作篇。

建議前置閱讀：

- [00_專案迭代講義.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/00_專案迭代講義.md:1)
- [02_0_API contract truth 的重要性與實作方式.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_0_API contract truth 的重要性與實作方式.md:1)

它要處理的不是 ORM、不是資料庫，也不是 auth，而是先把目前 `backend.ts` 的 API 邊界補完整，讓 route schema 成為真正的 API contract truth。

---

## 1. 這一步要達成的功能

這次調整的目標是：

1. 讓每條主要 route 都有明確的 `params / query / body / response`
2. 讓成功回應與錯誤回應格式更一致
3. 讓後續 `Drizzle + Neon` 重構時，有穩定的 API 邊界可依循

換句話說，這一步不是改功能，而是：

`先把 API 的形狀固定下來。`

---

## 2. 目前 backend.ts 的狀態

目前的 `backend.ts` 已經有部分 schema，但還不完整。

已經做得不錯的地方：

- 多數 route 已有 `body` 或 `query` 驗證
- 動態路徑多半已有 `params` 驗證

目前仍缺的地方：

- 很多 route 沒有明確 `response` schema
- 錯誤回應沒有制度化
- 菜單與訂單 API 的成功回應格式雖然大致一致，但沒有被完整宣告成 contract
- `login`、`orders` 等 route 的不同 status code 沒有清楚對應 schema

---

## 3. 建議的實作原則

### 原則一：先補齊，不先重構

這一輪不要急著拆 route 檔、不要急著改資料層。

先做的事情只有：

- 補 schema
- 補 response
- 統一錯誤格式

原因是先把 contract 穩住，比先把程式拆漂亮更重要。

### 原則二：先以目前行為為準，不要在這一步偷改 API 設計

例如：

- `/api/orders/current?userId=...`
- `/api/orders/history?userId=...`

這種設計雖然之後會被 auth 重構掉，但在這一輪仍應先如實定義成 schema，不要在這一步就順手改掉。

原因是：

- 這一步是在固定目前 contract
- 不是在提前做下一步的 auth 重構

### 原則三：成功回應與錯誤回應要分別定義

不要只定義 happy path。

如果某條 route 可能回：

- `200`
- `201`
- `400`
- `401`
- `403`
- `404`
- `409`

那就應該盡量把這些情況的 response schema 一起補齊。

---

## 4. 建議先補的共用 schema

這一步可以先從 `shared/contracts.ts` 或 `backend.ts` 內的局部常數開始整理。

最值得先抽的共用結構有：

### 成功回應

- `ApiDataResponse<MenuItem>`
- `ApiDataResponse<MenuItem[]>`
- `ApiDataResponse<OrderResponse>`
- `ApiDataResponse<OrderResponse[]>`
- `ApiDataResponse<OrderResponse | null>`
- `ApiDataResponse<Omit<User, "password">>`

### 錯誤回應

- `ApiErrorResponse`

例如常見錯誤：

- `{ error: "Invalid credentials" }`
- `{ error: "User not found" }`
- `{ error: "Order not found" }`
- `{ error: "Forbidden" }`

建議做法是：

- 先接受目前錯誤訊息字串仍不完全統一
- 但 response shape 至少先統一成 `ApiErrorResponse`

---

## 5. 建議的修改順序

### 步驟 1：先補 `/api/auth/login`

原因：

- 結構簡單
- 很適合建立「成功 + 失敗 response 都要有 schema」的範例

要補的內容：

- `body`
- `response`
  - `200`
  - `401`

### 步驟 2：補菜單 API

包含：

- `GET /api/menu`
- `POST /api/menu`
- `PATCH /api/menu/:id`
- `DELETE /api/menu/:id`

要補的內容：

- `response` schema
- 找不到資料時的 `404`
- 建立成功時的 `201`

### 步驟 3：補訂單查詢 API

包含：

- `GET /api/orders`
- `GET /api/orders/current`
- `GET /api/orders/history`
- `GET /api/orders/:id`

這一步最重要的是：

- `query` 已有的要保留
- `response` 補完整
- `403 / 404` 補齊

### 步驟 4：補訂單操作 API

包含：

- `POST /api/orders`
- `PATCH /api/orders/:id`
- `POST /api/orders/:id/submit`

這一步最重要的是：

- `201` 與 `200` 的差異要清楚
- `400 / 403 / 404 / 409` 補齊

---

## 6. 依目前 backend.ts，哪些地方最該先補

以下是目前最值得優先處理的區塊：

### `app.get("/api/menu")`

目前問題：

- 沒有明確 `response`

建議補上：

- `200: ApiDataResponse<MenuItem[]>`

### `app.post("/api/auth/login")`

目前問題：

- 有 `body`
- 但缺完整 `response`

建議補上：

- `200: ApiDataResponse<SafeUser>`
- `401: ApiErrorResponse`

### `app.get("/api/orders")`

目前問題：

- 沒有 `response`

建議補上：

- `200: ApiDataResponse<OrderResponse[]>`

### `app.get("/api/orders/current")`

目前問題：

- 有 `query`
- 缺 `response`

建議補上：

- `200: ApiDataResponse<OrderResponse | null>`
- `404: ApiErrorResponse`

### `app.get("/api/orders/history")`

目前問題：

- 有 `query`
- 缺 `response`

建議補上：

- `200: ApiDataResponse<OrderResponse[]>`
- `404: ApiErrorResponse`

### `app.get("/api/orders/:id")`

目前問題：

- 有 `params`、`query`
- 缺 `response`

建議補上：

- `200: ApiDataResponse<OrderResponse>`
- `403: ApiErrorResponse`
- `404: ApiErrorResponse`

### `app.patch("/api/orders/:id")`

目前問題：

- 有 `body`
- 缺 `params`
- 缺 `response`

建議補上：

- `params`
- `200: ApiDataResponse<OrderResponse>`
- `403 / 404 / 409 / 500: ApiErrorResponse`

### `app.post("/api/orders/:id/submit")`

目前問題：

- 已有 `params` 與 `body`
- 缺 `response`

建議補上：

- `200: ApiDataResponse<OrderResponse>`
- `400 / 403 / 404 / 409 / 500: ApiErrorResponse`

---

## 7. 實作時建議怎麼寫

### 做法一：先建立共用 response schema 常數

例如在 `backend.ts` 檔案前段建立：

- `apiErrorResponseSchema`
- `menuItemSchema`
- `orderResponseSchema`

好處：

- 避免每條 route 都重複寫一份
- 之後接 OpenAPI 時也比較乾淨

### 做法二：優先讓 response schema 可讀

如果 schema 太長，可抽成命名常數，不要全塞在 route 內。

原因：

- 這一輪重點是 contract 清楚
- 不是追求一行寫完

### 做法三：不要一次追求 100% 完美抽象

先做到：

- schema 完整
- route 可讀
- 成功與錯誤路徑可被描述

就已經足夠。

---

## 8. 這一步做完後會得到什麼

完成後，完成後將得到三個直接收益：

1. route 的輸入輸出邊界變清楚
2. 前端與測試不再只靠口頭默契理解 API
3. 後續做 `Drizzle + Neon` 時，比較能確定自己只是在換資料來源，而不是偷偷改 API

---

## 9. 這一步之後接哪一步

這一輪完成後，下一步不是立刻進 auth，而是：

1. 先導入 OpenAPI / Swagger 輸出
2. 再進入 `Drizzle + Neon`

原因是：

- route schema 補齊後，最自然的下一步就是把 contract 輸出成文件
- 等 contract 與文件層都穩住，再進資料庫重構，風險最低

---

## 10. 一句話總結

這份實作清單的目的，不是先改功能，而是先把目前 `backend.ts` 的每一條主要 route 補成真正可驗證、可推導、可輸出的 API contract。

下一份建議接著閱讀：

- [02_2_導入 OpenAPI ／ Swagger 輸出.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_2_導入 OpenAPI ／ Swagger 輸出.md:1)
- [03_為什麼這個專案選 Drizzle + Neon.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_為什麼這個專案選 Drizzle + Neon.md:1)
