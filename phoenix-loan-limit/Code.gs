/**
 * 課程授權序號檢查＋內建 AI 服務代理後端 —— 貼到 Google Sheet 的「擴充功能 > Apps Script」，
 * 部署為 Web App 後，把取得的網址填進 index.html 的 LICENSE_CHECK_URL。
 * 部署步驟見同資料夾的 SETUP-授權伺服器設定.md。
 *
 * 對應的 Google Sheet 需有表頭欄位（欄位順序不拘，依表頭文字比對）：
 *   序號 / 開始日期 / 結束日期
 * 教師要開一個新班級時：在表格新增一列，填「序號」欄，
 * 「開始日期」「結束日期」留空——學員第一次驗證序號時會自動寫入
 * （開始日期＝當下時間，結束日期＝開始日期 + VALID_MONTHS 個月）。
 *
 * 「課程內建 AI 服務」（學員不需自備 API 金鑰）：
 * 到 Apps Script 編輯器左側「專案設定 → 指令碼屬性（Script Properties）」新增：
 *   CLAUDE_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY
 * 想開放哪個服務商就設哪一個，不需要全部設定；沒設定的服務商，學員仍可自行輸入
 * 自己的 API 金鑰使用。金鑰存在 Script Properties，不會出現在這份程式碼裡，
 * 也不會傳到學員的瀏覽器。
 */

const VALID_MONTHS = 4;
const COL_SERIAL = "序號";
const COL_START = "開始日期";
const COL_END = "結束日期";
// 若序號資料不在第一個工作表，把分頁名稱填在這裡；留空則自動用第一個工作表
const SHEET_NAME = "";

const PROVIDER_KEY_PROPS = {
  claude: "CLAUDE_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
};

function doPost(e) {
  let result;
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const serial = String(payload.serial || "").trim();
    const action = payload.action || "check";

    if (!serial) {
      result = { valid: false, reason: "missing_serial" };
    } else if (action === "llm") {
      const license = checkOrActivate(serial);
      result = license.valid
        ? Object.assign({}, license, callProviderLLM_(
            String(payload.provider || ""), String(payload.model || ""), String(payload.prompt || "")
          ))
        : license;
    } else {
      result = checkOrActivate(serial);
    }
  } catch (err) {
    result = { valid: false, reason: "server_error", message: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 方便部署後用瀏覽器直接開網址測試是否部署成功
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    message: "授權伺服器運作中。請用 POST 傳送 JSON body，例如 {\"serial\":\"k9T2mP8x\"}"
  })).setMimeType(ContentService.MimeType.JSON);
}

function getLicenseSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (SHEET_NAME && ss.getSheetByName(SHEET_NAME)) || ss.getSheets()[0];
}

function checkOrActivate(serial) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getLicenseSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { valid: false, reason: "serial_not_found" };

    const header = values[0];
    const colSerial = header.indexOf(COL_SERIAL);
    const colStart = header.indexOf(COL_START);
    const colEnd = header.indexOf(COL_END);
    if (colSerial < 0 || colStart < 0 || colEnd < 0) {
      return { valid: false, reason: "server_error", message: "表頭找不到「序號」「開始日期」「結束日期」欄位" };
    }

    let rowIdx = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][colSerial]).trim() === serial) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { valid: false, reason: "serial_not_found" };

    const sheetRow = rowIdx + 1; // 轉成 1-indexed 的實際列號
    let startVal = values[rowIdx][colStart];
    let endVal = values[rowIdx][colEnd];
    const now = new Date();

    // 第一次有人驗證這組序號：開始計時
    if (!startVal) {
      startVal = now;
      sheet.getRange(sheetRow, colStart + 1).setValue(startVal);
    }
    // 若結束日期還沒算過（或開始日期是這次才補的），依開始日期 +4 個月算出
    if (!endVal) {
      endVal = new Date(startVal);
      endVal.setMonth(endVal.getMonth() + VALID_MONTHS);
      sheet.getRange(sheetRow, colEnd + 1).setValue(endVal);
    }

    const endDate = new Date(endVal);
    endDate.setHours(23, 59, 59, 999); // 結束日當天結束前都算有效
    const valid = now.getTime() <= endDate.getTime();

    return {
      valid: valid,
      reason: valid ? "ok" : "expired",
      activatedAt: new Date(startVal).toISOString(),
      expiresAt: new Date(endVal).toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

// 序號已驗證有效後才會呼叫這裡：用教師存在 Script Properties 的金鑰代打給服務商，
// 學員的瀏覽器全程看不到真正的金鑰。回傳 providerStatus/providerBody，
// 刻意模擬「原本應該從服務商拿到的 HTTP 狀態碼與原始回應內容」，
// 讓 index.html 端可以沿用同一套解析／重試邏輯，不用為代理路徑另外寫一份。
function callProviderLLM_(provider, model, prompt) {
  const keyProp = PROVIDER_KEY_PROPS[provider];
  const apiKey = keyProp && PropertiesService.getScriptProperties().getProperty(keyProp);
  if (!apiKey) {
    return {
      providerStatus: 501,
      providerBody: JSON.stringify({
        error: { message: "教師尚未在 Apps Script 設定「" + provider + "」的內建金鑰，請選擇其他服務商" }
      })
    };
  }

  let url, headers, payload;
  if (provider === "claude") {
    url = "https://api.anthropic.com/v1/messages";
    headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    payload = { model: model, max_tokens: 16000, messages: [{ role: "user", content: prompt }] };
  } else if (provider === "openai") {
    url = "https://api.openai.com/v1/chat/completions";
    headers = { authorization: "Bearer " + apiKey };
    payload = { model: model, messages: [{ role: "user", content: prompt }] };
  } else if (provider === "gemini") {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    headers = { "x-goog-api-key": apiKey };
    payload = { contents: [{ parts: [{ text: prompt }] }] };
  } else if (provider === "openrouter") {
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers = { authorization: "Bearer " + apiKey };
    payload = { model: model, messages: [{ role: "user", content: prompt }] };
  } else {
    return { providerStatus: 400, providerBody: JSON.stringify({ error: { message: "不支援的服務商：" + provider } }) };
  }

  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  return { providerStatus: resp.getResponseCode(), providerBody: resp.getContentText() };
}
