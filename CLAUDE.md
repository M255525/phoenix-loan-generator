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
- 「財務與資金計畫」分頁的損益說明卡片內，額外有一張比照銀行制式申貸書格式的「營業損益明細表」（`finance.profitLossDetail`：`isEstimate` ＋ `month1`/`month6`/`month12` 三欄，各含 `dateFrom`/`dateTo`/`revenue`/`cost`/`expense`）；③營業毛利、⑤營業利潤為衍生值，不落地存在 state，由 `refreshProfitLossTable()`（掛在 `refreshDerived()` 內）即時算出寫回對應 `#plGross_*`/`#plNet_*` 儲存格，`renderPreview()` 也各自重算一次寫入預覽／Word 匯出的表格。5 組範例與 `EMPTY_STATE` 皆已補上此欄位（`setPath` 不會自動建立缺漏的巢狀物件，新增巢狀欄位時務必同步補齊所有初始 state，否則該範例載入後綁定會失敗）。
- 預覽（`renderPreview()`）依官方申請書章節順序輸出 HTML，未填欄位一律顯示紅字 placeholder（例如「現有設備」「尚需資金用途明細」），提醒使用者這些是常被要求補件的必填項目。「肆、創業貸款計畫書」（經營現況／市場分析／償貸計畫／自傳簡述）與其餘章節一樣，一律用 `<table><th>標籤</th><td>${nl2br(...)}</td></table>` 表格呈現，不要退回成單獨的 `<p>` 段落——`_docxTableFromElement()` 只認得 `<table>`，用 `<p>` 呈現的內容雖然預覽看得到，但 Word 匯出的表格化排版就沒有了。
- **個資隱藏**（`#hidePiiToggle`，位於「五、預覽與列印」分頁頂部）：純顯示層開關，不寫入 `state`／不影響表單實際資料，只影響 `renderPreview()` 產出的 HTML（因此連動列印與 Word 匯出）。狀態存在獨立的 `localStorage`（key: `phoenixLoanHidePII`），與主資料 `phoenixLoanState` 分開，重新整理頁面會記住上次的開關選擇。遮蔽對象限「申請人基本資料」的個人識別欄位（姓名／出生年月日／身分證字號／電話／手機／傳真／e-mail／戶籍地址／通訊地址／配偶資料／聯絡親友，以及伍、切結書重複出現的姓名/身分證/住址），刻意不遮蔽「貳、所營事業資料」（事業名稱/地址/統編）——事業登記資料不算個資法定義的個人資料。遮蔽邏輯是 `piiField(v, maskFn)` ＋ `maskName`/`maskId`/`maskPhone`/`maskEmail`/`maskBirthDate`/`maskAddress` 這組函式（在 `orPlaceholder()` 之後定義），地址遮蔽只留「縣市＋鄉鎮市區」；開啟時預覽底部會加一行紅字提醒「正式送件前請關閉」。
- **Word 匯出的多段落表格儲存格**：`_docxLinesFromNode()` 把 `<p>`／`<div>` 視為分行邊界（前後各斷一行），這是因為 `nl2br()` 把多行文字轉成連續的 `<p>...</p>`，而這些內容幾乎都被放進表格 `<td>` 裡（損益說明、經營現況各段、自傳簡述等）——如果 `<td>` 內有多個 `<p>`，沒有這段邏輯就會被合併成一整段沒有換行的文字寫進 Word。新增任何「表格內放多段落文字」的欄位時，直接沿用 `nl2br()` 即可，不需要另外處理分行。
- 列印使用 `window.print()` + `@media print` 隱藏表單/導覽，只印出 `#preview` 內容。
- **上傳申請書辨識**（標題列「上傳申請書辨識」按鈕）：接受 `.docx` 與 `.pdf`，全程在瀏覽器本機解析，不上傳伺服器。docx 走內建的 ZIP 解析（`DecompressionStream("deflate-raw")` 解壓 `word/document.xml`，`</w:tc>`→`" | "`、`</w:p>`→`"\n"` 轉純文字——注意儲存格結尾的換行要先收斂到 `|` 前，label 才對得上值）；PDF 則 lazy-load CDN 的 pdf.js（需網路；掃描影像 PDF 無文字層會報錯提示改用 docx），並依文字項的水平間距補插 `|` 分隔符。`parseApplication()` 以官方表格的標籤與 `■` 勾選記號做規則式擷取（非 AI），套用前 `confirm()`，結果報告（辨識到／未辨識）顯示在申請人分頁頂部的 `#importReportCard`。
  - **雙層擷取策略**：PDF 表格值常在窄儲存格內折行、字間插空白（「300001 新竹市⏎光復路50號」「王⏎志明」），行內 regex 會失效。因此 `parseApplication()` 備有 `flat`（去除所有空白/換行/`|` 的壓平文本）備援層——行內版失敗時改在 flat 上以「內容錨點」界定值的結尾：地址以 `號/樓/室` 結尾、經歷以「機構後綴＋職稱＋日期對」擷取、營業項目以段落序號（`六、`）為界。修改擷取規則時兩層都要顧。
  - 已知陷阱（測試檔 `make_test_docx.py` 於 scratchpad 重現過）：檢核表首頁的「員工人數未滿5人」干擾、配偶姓名與下一標籤連寫（「李小華國民身分證…」需 lookahead 斷開）、標籤儲存格內部換行（「主要產品\n(或業務)」）、底線填空（`＿新竹＿分行`）。
  - **肆、創業貸款計畫書也會匯入**（`planFields` 陣列）：一（一）～一（四）經營現況、二（一）（二）市場分析、四、自傳簡述，逐項對應到 `plan.productService`/`businessHours`/`customerSource`/`coOperationNote`/`targetMarketAnalysis`/`marketOutlook`/`autobiography`；三、償貸計畫的淨利/利率/攤還本金數字另外用正規表達式擷取到 `plan.repayment`。官方書表各子項標題是否帶「請說明」前綴，不同文件版本量測起來不一致，因此比對用的起訖 regex 一律把「請說明」設為可省略（`(?:請說明)?`），只鎖「產品或服務內容」「營業時間」「市場潛力」等名詞關鍵字——之後若使用者回報某個計畫書子項匯入不到，先確認該小節標題的關鍵字是否仍被涵蓋，而不是照搬固定句式比對。
- **一鍵生成／優化**（計畫書分頁頂部）：`generatePlan()` 純本機規則模板，會（1）依貸款金額/期間/利率重算每月攤還本金與本息年金；(2) 依資金用途明細重組「貸款用途及效益說明」；(3) 生成「獲利轉正說明」含償貸能力檢核（預估淨利 vs 年攤還額+既有借款）；(4) 依基本資料重組自傳骨架。無法推斷的事實一律以【】placeholder 標示請使用者補填，不憑空捏造數字。生成前自動備份到 `localStorage`（key: `phoenixLoanBackup`），「復原生成前內容」可一鍵還原（重載頁面後仍可復原）。生成文案風格依 humanizer 原則（第一人稱、長短句、無公文腔）——修改模板時維持這個調性。
- **AI 優化（串接外部 LLM API，選用）**：計畫書分頁的第二張卡片，可串 Claude／OpenAI／Gemini／OpenRouter。設定（provider/model/apiKey）存在 `localStorage`（key: `phoenixLoanApiConfig`）——**金鑰只落在使用者本機瀏覽器，絕不可寫進程式碼或範例**。實作重點：
  - 全部走瀏覽器直連 `fetch()`：Claude 需 `anthropic-dangerous-direct-browser-access: true` header（已驗證 CORS 通）；Gemini 金鑰放 `x-goog-api-key` header（刻意不放 URL query 以免金鑰進網址）；OpenAI/OpenRouter 用 Bearer。預設模型：`claude-opus-4-8` / `gpt-4o-mini` / `gemini-2.5-flash` / `openai/gpt-4o-mini`（模型欄可自由改）。
  - `buildAiPrompt()` 把結構化事實（數字）＋現有段落＋humanizer 風格要求組成 prompt，要求模型**只重寫 `AI_FIELDS` 列的 8 個敘述欄位**、不得捏造數字、缺事實用【】標示；數字欄位（攤還、金額）一律不交給模型。回應以 `extractJsonObject()` 寬鬆解析（容忍 ```json 圍欄與前後夾雜文字）。
  - 套用前備份到同一個 `phoenixLoanBackup`，與規則式生成共用「復原生成前內容」按鈕。逾時 180 秒（`AbortSignal.timeout`，每次嘗試各自計時）；遇暫時性錯誤（429/500/503/529）自動重試最多 2 次（間隔 8、16 秒），重試進度顯示於 `#aiReport`（與 sbir-generator／icap-generator 為同一套實作，修改時互相參照）。

- **從「開店前置清單」帶入**（2026-11-13）：`shop-opening-checklist` 的 AI 助手分頁開 `https://m255525.github.io/phoenix-loan-generator/#shopImport=<base64url JSON>`。`offerShopImport()`（init 最後呼叫）讀完立刻 `replaceState` 清掉 hash，`cleanShopImport()` 只收白名單欄位（business.name/regType/employeeCount/mainProducts、finance.totalFunding/selfFunding/requestedLoanAmount/fundUse、plan 五段），在 `<main>` 上方插提示列（不用 `confirm()`），按「套用」才寫入；套用前備份到 `phoenixLoanBackup`。`startedFromSample`（載入時沒有 phoenixLoanState）→ 從 `EMPTY_STATE` 開始，避免混到早餐店範例的虛構申請人。資金用途是整份開辦預算，跟「尚需資金」對不起來是預期的，提示列會請使用者刪減。教學版 `phoenix-loan-limit/` 沒有這個功能。**測試注意**：同網址只改 hash 不會重新載入頁面，要先切到別頁再開。

## 指令

無建置/測試指令。修改 `index.html` 後直接用瀏覽器開啟驗證即可（若本機未連接 Preview MCP，可用 `python -m http.server <port> --directory phoenix-loan-generator` 暫時起一個靜態伺服器測試，測完記得關閉）。

### 課程教學版（phoenix-loan-limit/）

子資料夾 `phoenix-loan-limit/` 是給學員使用的教學版：功能與根目錄版本相同，但 banner 有課程授權序號欄位（顯示剩餘可用天數），透過 Google Apps Script 連線 Google Sheet 檢查，自序號啟用起提供 4 個月使用期限，逾期後「AI 優化」功能停用（其餘功能不受影響）；AI 優化不需要學員自備 API 金鑰，留空即走 Apps Script 代理、用教師存的內建金鑰；網站標題列採紅色 banner 以與本版區隔。詳見 `phoenix-loan-limit/CLAUDE.md`。**這是獨立複製的 `index.html`，不是共用檔案**——根目錄版本異動時不會自動同步過去，需要時手動套用。

### 桌面版 exe（phoenix-loan/）

`phoenix-loan/PhoenixLoanGenerator.exe` 是可攜式單檔桌面版：`launcher.py` 把 index/manual/README 打包進 exe，執行時於 `127.0.0.1:8770` 起本機伺服器並開預設瀏覽器（**固定 8770 埠**——localStorage 綁定 origin，換埠會讓使用者已填的資料「消失」）。**修改 index.html 後 exe 不會自動更新，需重建**（PowerShell、絕對路徑，`--add-data` 的相對路徑會以 specpath 為準而踩雷）：

```powershell
$proj = "C:\Users\mark_\AI Test\政府補助認證產生器\phoenix-loan-generator"
cd $proj
python -m PyInstaller --onefile --console --name PhoenixLoanGenerator `
  --distpath "$proj\phoenix-loan" --workpath "$env:TEMP\pyi-build" --specpath "$env:TEMP" `
  --add-data "$proj\index.html;." --add-data "$proj\manual.html;." --add-data "$proj\README.md;." `
  launcher.py
```

exe 未簽章，首次執行會遇 SmartScreen 警告（`phoenix-loan/使用說明.txt` 已向使用者說明）。
