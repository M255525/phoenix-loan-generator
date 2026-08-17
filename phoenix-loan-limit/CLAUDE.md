# CLAUDE.md — phoenix-loan-generator/phoenix-loan-limit

`phoenix-loan-generator` 的**課程教學版**（子資料夾，非獨立 git 儲存庫——commit 在 `phoenix-loan-generator` 這個 repo 裡）。與根目錄的一般版功能完全相同，差異只有：

1. **Banner（header）有課程授權序號欄位**，會連線 Google Apps Script 對照 Google Sheet 資料，驗證通過後在 banner 顯示剩餘可用天數。序號自全班第一次驗證起提供 4 個月使用期限（開始/結束日期由 Sheet 資料決定，見下方架構說明）。
2. **AI 優化功能受此序號期限限制**：逾期後停用，其餘功能（表單填寫、上傳辨識、離線規則式生成／優化、預覽列印）不受影響、永久可用。
3. **AI 優化不需要學員自備 API 金鑰**：API 金鑰欄位留空時，改由 Apps Script 用教師存在 Script Properties 的金鑰代打給服務商（proxy），學員金鑰仍可選填（bring-your-own-key，直連服務商，不經 proxy）。
4. **網站標題列（header）採紅色底色**（`--banner`/`--banner-dark` 變數），與其他版本的藍色 banner 區隔。

## 架構

- `index.html` — 直接複製自 `../index.html` 再疊加修改，**不是共用檔案**；根目錄 index.html 有任何 bug 修正或功能異動時，要手動同步套用到這裡（目前沒有自動化同步機制）。
- **授權序號 UI 在 header 的 `.license-bar`**（`#licenseSerial` 輸入框、`#btnCheckLicense` 按鈕、`#licenseStatus` 狀態徽章），不在 AI 優化卡片裡（AI 卡片本身沒有序號欄位，只讀取 banner 的值）。`initLicenseBar()` 在頁面載入時，若 localStorage 已存序號會自動靜默驗證一次（顯示剩餘天數），不需要使用者手動按驗證。
- 授權序號檢查邏輯：`LICENSE_CHECK_URL`／`checkLicense()`／`LICENSE_REASON_LABEL`／`renderLicenseStatus()`／`runLicenseCheck()` 在 `index.html` 的 JS 區塊最前面。`runLicenseCheck()` 回傳值一律正規化成 `{valid, reason, message?, expiresAt?}`，呼叫端不需要再包 try/catch。剩餘天數＝`Math.ceil((expiresAt-now)/86400000)`，≤7 天時徽章變 warn（橘）樣式提醒即將到期。
- **每次按下「AI 優化」都會呼叫 `runLicenseCheck()` 即時重新驗證，不做本機快取**（刻意設計：確保逾期後即使先前驗證過也無法再用），驗證通過才會呼叫 `callLLM()`。
- `localStorage` 另用獨立 key `phoenixLoanLimitSerial` 存序號，與根目錄版本的 `phoenixLoanApiConfig`／`phoenixLoanState` 等 key 不衝突。
- **AI 呼叫的兩條路徑**（`callLLM(provider, model, apiKey, prompt, serial, onRetry)`）：
  - `apiKey` 非空：跟根目錄版本一樣，瀏覽器直連服務商 API。
  - `apiKey` 為空：改呼叫 `callLLMViaProxy(serial, provider, model, prompt)`，POST 到同一個 `LICENSE_CHECK_URL`（`action:"llm"`），由 Apps Script 重新驗證序號後用教師的內建金鑰代打。proxy 回傳的 `{providerStatus, providerBody}` 刻意模擬成「一個 fetch Response 的 status/text」，讓重試（429/500/503/529，8s／16s backoff）與逐服務商 `extract()` 解析邏輯**兩條路徑共用同一份**，不必為 proxy 另寫一份。
- `Code.gs` — 部署到 Google Sheet 的 Apps Script 原始碼：`doPost` 依 `action` 分派（預設/`"check"` 只做序號驗證＋首次自動啟用；`"llm"` 先驗證序號、通過才呼叫 `callProviderLLM_()` 用 `PropertiesService.getScriptProperties()` 裡的 `CLAUDE_API_KEY`／`OPENAI_API_KEY`／`GEMINI_API_KEY`／`OPENROUTER_API_KEY` 代打對應服務商），`doGet` 供部署後測試。**這不是這個資料夾裡的檔案在跑**，是使用者手動複製貼到 Google Sheet 的「擴充功能 → Apps Script」編輯器裡部署成 Web App，取得網址後回填到 `index.html` 的 `LICENSE_CHECK_URL`；內建金鑰另外在 Apps Script 的「專案設定 → Script Properties」設定（選用，教師可以只開放部分服務商，或完全不設、讓學員自帶金鑰）。部署步驟見 `SETUP-授權伺服器設定.md`。
- 綁定的 Google Sheet：<https://docs.google.com/spreadsheets/d/19VlRFkPpSyLDyB0KKDWHMzq8s6Fvc-KyG56EDKGc9EQ/edit>（使用者自己的任務追蹤表，序號相關欄位為「序號」「開始日期」「結束日期」，`Code.gs` 用表頭文字比對欄位、不依賴欄位順序）。**我（Claude）沒有工具可以直接部署 Apps Script**（需要使用者手動在 Google 帳號下走 OAuth 同意流程），只能產生程式碼與指南，實際部署與回填網址需要使用者自己做或口頭告知網址後由我代填。
- **安全設計**：`Code.gs` 的 `"llm"` action 一定會先重新做一次伺服器端序號驗證（不信任前端已經驗證過），才會動用教師的內建金鑰——避免有人繞過前端直接打 Apps Script 網址、拿沒有效期的序號白嫖內建 AI 服務。真正的服務商金鑰只存在 Script Properties，不出現在 `Code.gs` 原始碼、也不會傳到瀏覽器。
- CORS 細節：兩條 fetch（`checkLicense()`／`callLLMViaProxy()`）呼叫 `LICENSE_CHECK_URL` 時**刻意不設自訂 Content-Type**（讓瀏覽器預設用 `text/plain`），避免觸發 Apps Script 不支援的 CORS 預檢（OPTIONS）請求——這是已知的 Apps Script Web App 限制，修改請求邏輯時要保留這個做法。

## 匯出浮水印與頂部跑馬燈（2026-08-17 新增）

- **浮水印**：跟 `IPA_Kano` 進階版共用同一張「馬克老師AI」品牌浮水印來源（`資料儀表板/IPA_Kano/watermark-source.png`，480×297 已去背 PNG）。畫面「預覽與列印」（含 `window.print()` 列印／另存 PDF）疊加方式與 IPA_Kano 相同：`<div class="doc-watermark" id="previewWatermark">` 疊在 `#preview-wrap`（`position:relative`）內、`#preview` 之前，圖片 `opacity:.08`；`@media print{ .doc-watermark{position:fixed;} }` 讓水印每頁重複出現。**Word（.docx）匯出走不同機制**——本專案的 Word 匯出不是像 IPA_Kano 那樣輸出 HTML `.doc`，而是用 `docx@9.7.1`（`loadDocxLib()` 走 jsdelivr CDN）組出真正的 `.docx` 結構，所以水印改用 `docx.ImageRun` 的 `floating`（`behindDocument:true`、`wrap:NONE`、置中）插進 `sections[0].headers.default`（`docx.Header`），這樣水印會在**每一頁的頁首圖層都重複出現**，比 IPA_Kano 的 HTML 背景圖只出現一次更完整。**docx@9.7.1 的 `ImageRun` 沒有 `transparency`/`alpha` 選項**（已用 Node 直接建置＋解壓 XML 驗證過，選項不存在也不會報錯，只是完全無效果）——改用預先把來源 PNG 的 alpha 通道整體乘以 0.30（Pillow `alpha.point(lambda p: int(p*0.30))`）烘焙出的淡化版本 `WATERMARK_DOCX_BASE64`，画面/列印/PDF 則仍用未烘焙的原圖＋CSS `opacity:.08`（兩者是各自獨立的 base64 常數，因為呈現機制不同、沒辦法共用同一張淡化強度）。
- 兩個常數 `WATERMARK_DATA_URI`（原圖 data URI，約 15 萬字元）與 `WATERMARK_DOCX_BASE64`（烘焙淡化版原始 base64，不含 `data:` 前綴，約 14.6 萬字元）都寫死在 `index.html` 的 `<script>` 區塊裡（`renderPreview()` 之前）。**改水印圖片時不要用 Edit 工具手動編輯**——用 Python 腳本重新讀圖、`base64.b64encode`、對 html 檔案做字串取代（`html.replace(old_b64, new_b64)`），避免把巨大字串整包載入對話上下文（同 `IPA_Kano` 的做法）。瀏覽器端把 `WATERMARK_DOCX_BASE64` 轉回 bytes 用 `Uint8Array.from(atob(...), c=>c.charCodeAt(0))` 再傳給 `docx.ImageRun({data: bytes, ...})`——**不要直接把 base64 字串傳給 `data`**，`RegularImageOptions.data` 雖然型別上接受 `string`，但實際字串編碼行為未經驗證，用 `Uint8Array` 才是與 Node 端 `Buffer` 完全等價、已驗證過的路徑。
- **驗證方式**：本機沒有 LibreOffice/Word 可視覺開啟 `.docx`（見 `xlsx-skill-no-libreoffice` 記憶），改用 Node 直接 `npm install docx@9.7.1` 在 scratchpad 建一份測試文件、`unzip` 解壓 `word/header1.xml` 檢查 `<w:drawing>`／`<wp:anchor behindDoc="1">`／`<a:blip>` 的 XML 結構是否符合預期；瀏覽器端則用 Chrome DevTools（`javascript_tool`）在真實頁面呼叫 `loadDocxLib()` + `docx.Packer.toBlob(doc)` 確認能在瀏覽器組出正確 MIME type 與非零檔案大小的 blob（**不觸發實際下載**，下載需使用者許可）；畫面浮水印用 `getComputedStyle` 確認 `opacity:"0.08"`、`position:"absolute"`。截圖工具在這次驗證中持續逾時（頁面本身可正常互動，非本次改動造成的迴歸），改以上述 DOM/computed-style 檢查取代視覺截圖確認。
- **跑馬燈**：`#marqueeBar` 是 body 開頭、`<header>` 之前的**一般 flow 元素**（非 fixed；本專案版面是一般文件流＋`nav.tabs { position:sticky; top:0 }`，跟 `mrvideo_s`／`AIvideo_studio` 的 flex 版面不同，故不需要額外 padding-top 補償），獨立 `<script>` IIFE、跟序號授權（`LICENSE_CHECK_URL`／`checkLicense()`）完全無關，**直接呼叫**工作區共用的跑馬燈端點（跟 `mrvideo_s` 的「direct-call」做法一致，沒有整合進本專案自己的 `Code.gs`）：`https://script.google.com/macros/s/AKfycbwKX0.../exec`（POST 空序號，`doPost` 不論序號有效與否都會附帶 `marquee` 陣列），`localStorage` key `phoenixLoanLimitMarquee`，每 20 分鐘重抓一次。改跑馬燈內容直接編輯共用 Google Sheet 即可，不需重新部署，也不會動到本專案自己的授權 Apps Script／Google Sheet。marqueeBar 帶 `no-print` class，列印/PDF/預覽不會印出跑馬燈。
- 兩項改動後已重建 `phoenix-loan-limit/PhoenixLoanLimitGenerator.exe`（`--add-data` 打包最新 `index.html`）。

## 桌面版 exe（phoenix-loan-limit/）

`phoenix-loan-limit/PhoenixLoanLimitGenerator.exe`（子資料夾與專案本身同名——原本叫 `exe/`，2026-07-23 依使用者要求改名）：做法比照 `../phoenix-loan/`，`launcher.py` 把 `index.html`／`manual.html`／`README.md` 打包進 exe，執行時於 **127.0.0.1:8778** 起本機伺服器（工作區固定埠——8770 一般版、8771 icap、8772 sbir、8773/8774 ai-video-studio、8775 IPA_Kano、8776 Dashboard、8777 Prompt，本專案取 8778，新專案取埠前先查其他子資料夾 CLAUDE.md）。**修改 index.html 後 exe 不會自動更新，需重建**：

```powershell
$proj = "C:\Users\mark_\AI Test\政府補助認證產生器\phoenix-loan-generator\phoenix-loan-limit"
python -m PyInstaller --onefile --console --name PhoenixLoanLimitGenerator `
  --distpath "$proj\phoenix-loan-limit" --workpath "$env:TEMP\pyi-build-limit" --specpath "$env:TEMP" `
  --add-data "$proj\index.html;." --add-data "$proj\manual.html;." --add-data "$proj\README.md;." `
  "$proj\launcher.py"
```

exe 未簽章，首次執行會遇 SmartScreen 警告（`phoenix-loan-limit/使用說明.txt` 已向學員說明）。exe 不進版控（見 `../.gitignore`）。

## 指令

無建置/測試指令。修改 `index.html` 後直接用瀏覽器開啟驗證即可；若要驗證授權序號檢查邏輯，需先照 `SETUP-授權伺服器設定.md` 部署好 Apps Script 並回填 `LICENSE_CHECK_URL`，否則會顯示「尚未設定授權伺服器網址」的 fail-closed 錯誤訊息（刻意設計，避免忘記部署時序號檢查被略過）。
