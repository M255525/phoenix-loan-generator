# CLAUDE.md — phoenix-loan-generator

單檔前端工具：填寫表單 → 即時產生「微型創業鳳凰貸款」申請書預覽 → 可列印/匯出 PDF。無建置步驟、無框架、無 package.json，直接開啟 `index.html`（`file://`）或以靜態伺服器託管即可。

`manual.html` 是給使用者看的操作手冊（HTML 排版版，`index.html` 標題列「操作手冊」按鈕與頁尾都連到它）；`README.md` 是同內容的 markdown 版。兩者都含創作者（Mark Tsai）資料與使用警語（僅供教學、課程及個人使用，禁止未經授權公開發布、販售或商業化使用）；警語同時顯示在 `index.html` 頁尾。**功能有增減時，`manual.html` 與 `README.md` 要一起更新。** 創作者經歷內容與 `sbir-generator/manual.html`、`icap-generator/manual.html` 為同一份，更新其中一邊時同步其餘兩邊。

## 背景與目的

依據勞動部勞動力發展署「微型創業鳳凰貸款」官方申請書格式（壹、申請人基本資料／貳、所營事業資料／參、財務分析與資金計畫／肆、創業貸款計畫書／伍、切結書）建置的填表輔助產生器，協助申請人（或協助申請人的顧問）整理內容、檢查數字一致性，最終產出可供對照官方書表填寫、或直接列印留存的完整申請書文字內容。**本工具本身不是官方申請系統**，產出內容仍需謄寫或對照填入官方紙本／線上申請書。

**重要：不得使用真實申請人個資。** 本工具最初參考過一份真實客戶（桃竹苗微鳳案例）的申請書 docx 來理解官方格式與常見填寫問題，但該案例含真實姓名、身分證字號、電話、地址等個資，使用者已明確要求**不得使用**這份真實資料。目前 `index.html` 中的 `SAMPLE_LIBRARY` 是 5 組完全虛構的產業範例（早餐店、手工皮革工作室、寵物美容店、手作保養品電商、居家清潔服務），人名／統編／電話／地址均為杜撰，僅供 demo 展示介面與資料結構之用，**不可再改回或帶入任何真實個案資料**。`EMPTY_STATE` 為全空白範本，供套用到其他真實申請人案例時使用（使用者自行輸入，不由 Claude 代填真實個資）。

## 架構

單一 `index.html`：內嵌 `<style>` 與 `<script>`，無外部資源、無 `fetch`，純用 `data-path` 屬性把表單欄位綁定到一個巢狀 `state` 物件（`applicant` / `business` / `finance` / `plan` / `oath`），並用 `localStorage`（key: `phoenixLoanState`）自動儲存。

- 五個分頁（`nav.tabs button[data-tab]` 對應 `section.tab[data-tab]`）：申請人資料、事業資料、財務與資金計畫、創業貸款計畫書、預覽與列印。
- 標題列的下拉選單（`#sampleSelect`）列出 `SAMPLE_LIBRARY` 的 5 個虛構產業範例，選定後按「載入所選範例」會覆蓋目前 `state`（有 `confirm()` 二次確認）。首次開啟（無 localStorage 紀錄）預設載入 `DEFAULT_SAMPLE_KEY`（目前為 `"breakfast"`）。
- 動態清單欄位（聯絡親友、經歷、職訓、借款項目、現有設備、資金用途明細）透過 `LIST_CONFIGS` + `renderListEditor()` 通用渲染，不要為每種清單各寫一份重複邏輯。
- 「尚需資金總額」與「資金用途明細加總」有即時一致性檢查（`refreshDerived()`），這是刻意設計——申請書最常見的補件原因之一就是資金用途金額對不起來。
- 預覽（`renderPreview()`）依官方申請書章節順序輸出 HTML，未填欄位一律顯示紅字 placeholder（例如「現有設備」「尚需資金用途明細」），提醒使用者這些是常被要求補件的必填項目。
- 列印使用 `window.print()` + `@media print` 隱藏表單/導覽，只印出 `#preview` 內容。
- **上傳申請書辨識**（標題列「上傳申請書辨識」按鈕）：接受 `.docx` 與 `.pdf`，全程在瀏覽器本機解析，不上傳伺服器。docx 走內建的 ZIP 解析（`DecompressionStream("deflate-raw")` 解壓 `word/document.xml`，`</w:tc>`→`" | "`、`</w:p>`→`"\n"` 轉純文字——注意儲存格結尾的換行要先收斂到 `|` 前，label 才對得上值）；PDF 則 lazy-load CDN 的 pdf.js（需網路；掃描影像 PDF 無文字層會報錯提示改用 docx），並依文字項的水平間距補插 `|` 分隔符。`parseApplication()` 以官方表格的標籤與 `■` 勾選記號做規則式擷取（非 AI），套用前 `confirm()`，結果報告（辨識到／未辨識）顯示在申請人分頁頂部的 `#importReportCard`。
  - **雙層擷取策略**：PDF 表格值常在窄儲存格內折行、字間插空白（「300001 新竹市⏎光復路50號」「王⏎志明」），行內 regex 會失效。因此 `parseApplication()` 備有 `flat`（去除所有空白/換行/`|` 的壓平文本）備援層——行內版失敗時改在 flat 上以「內容錨點」界定值的結尾：地址以 `號/樓/室` 結尾、經歷以「機構後綴＋職稱＋日期對」擷取、營業項目以段落序號（`六、`）為界。修改擷取規則時兩層都要顧。
  - 已知陷阱（測試檔 `make_test_docx.py` 於 scratchpad 重現過）：檢核表首頁的「員工人數未滿5人」干擾、配偶姓名與下一標籤連寫（「李小華國民身分證…」需 lookahead 斷開）、標籤儲存格內部換行（「主要產品\n(或業務)」）、底線填空（`＿新竹＿分行`）。
- **一鍵生成／優化**（計畫書分頁頂部）：`generatePlan()` 純本機規則模板，會（1）依貸款金額/期間/利率重算每月攤還本金與本息年金；(2) 依資金用途明細重組「貸款用途及效益說明」；(3) 生成「獲利轉正說明」含償貸能力檢核（預估淨利 vs 年攤還額+既有借款）；(4) 依基本資料重組自傳骨架。無法推斷的事實一律以【】placeholder 標示請使用者補填，不憑空捏造數字。生成前自動備份到 `localStorage`（key: `phoenixLoanBackup`），「復原生成前內容」可一鍵還原（重載頁面後仍可復原）。生成文案風格依 humanizer 原則（第一人稱、長短句、無公文腔）——修改模板時維持這個調性。
- **AI 優化（串接外部 LLM API，選用）**：計畫書分頁的第二張卡片，可串 Claude／OpenAI／Gemini／OpenRouter。設定（provider/model/apiKey）存在 `localStorage`（key: `phoenixLoanApiConfig`）——**金鑰只落在使用者本機瀏覽器，絕不可寫進程式碼或範例**。實作重點：
  - 全部走瀏覽器直連 `fetch()`：Claude 需 `anthropic-dangerous-direct-browser-access: true` header（已驗證 CORS 通）；Gemini 金鑰放 `x-goog-api-key` header（刻意不放 URL query 以免金鑰進網址）；OpenAI/OpenRouter 用 Bearer。預設模型：`claude-opus-4-8` / `gpt-4o-mini` / `gemini-2.5-flash` / `openai/gpt-4o-mini`（模型欄可自由改）。
  - `buildAiPrompt()` 把結構化事實（數字）＋現有段落＋humanizer 風格要求組成 prompt，要求模型**只重寫 `AI_FIELDS` 列的 8 個敘述欄位**、不得捏造數字、缺事實用【】標示；數字欄位（攤還、金額）一律不交給模型。回應以 `extractJsonObject()` 寬鬆解析（容忍 ```json 圍欄與前後夾雜文字）。
  - 套用前備份到同一個 `phoenixLoanBackup`，與規則式生成共用「復原生成前內容」按鈕。逾時 180 秒（`AbortSignal.timeout`，每次嘗試各自計時）；遇暫時性錯誤（429/500/503/529）自動重試最多 2 次（間隔 8、16 秒），重試進度顯示於 `#aiReport`（與 sbir-generator／icap-generator 為同一套實作，修改時互相參照）。

## 指令

無建置/測試指令。修改 `index.html` 後直接用瀏覽器開啟驗證即可（若本機未連接 Preview MCP，可用 `python -m http.server <port> --directory phoenix-loan-generator` 暫時起一個靜態伺服器測試，測完記得關閉）。

### 桌面版 exe（phoenix-loan/）

`phoenix-loan/PhoenixLoanGenerator.exe` 是可攜式單檔桌面版：`launcher.py` 把 index/manual/README 打包進 exe，執行時於 `127.0.0.1:8770` 起本機伺服器並開預設瀏覽器（**固定 8770 埠**——localStorage 綁定 origin，換埠會讓使用者已填的資料「消失」）。**修改 index.html 後 exe 不會自動更新，需重建**（PowerShell、絕對路徑，`--add-data` 的相對路徑會以 specpath 為準而踩雷）：

```powershell
$proj = "C:\Users\mark_\AI Test\phoenix-loan-generator"
cd $proj
python -m PyInstaller --onefile --console --name PhoenixLoanGenerator `
  --distpath "$proj\phoenix-loan" --workpath "$env:TEMP\pyi-build" --specpath "$env:TEMP" `
  --add-data "$proj\index.html;." --add-data "$proj\manual.html;." --add-data "$proj\README.md;." `
  launcher.py
```

exe 未簽章，首次執行會遇 SmartScreen 警告（`phoenix-loan/使用說明.txt` 已向使用者說明）。
