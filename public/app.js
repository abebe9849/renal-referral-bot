// public/app.js

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("form");
const inputEl = document.getElementById("input");
const statusEl = document.getElementById("status");
const sendButton = document.getElementById("sendButton");
const micButton = document.getElementById("micButton");
const imgButton = document.getElementById("imgButton");
const imageInput = document.getElementById("imageInput");
const copyButton = document.getElementById("copyButton");
const emailButton = document.getElementById("emailButton");
const draftButton = document.getElementById("draftButton");
const feedbackButton = document.getElementById("feedbackButton");
const usageButton = document.getElementById("usageButton");
const resetCaseButton = document.getElementById("resetCaseButton");


// =========================
// グローバル変数
// =========================
let messages = [];              // 画面表示用のログ
let isSending = false;
let lastLetterText = null;
let previousResponseId = null;  // Responses API の previous_response_id 相当
let totalInputTokens = 0;
let totalOutputTokens = 0;
let diseaseTerms = [];
let diseaseListLoaded = false;
// =========================
// 送信前マスキング（要配慮個人情報）
// =========================
function maskSensitiveInfo(text) {
  if (!text) return text;

  const protectedInfo = protectDiseaseTerms(text);
  let masked = protectedInfo.text;

  const rules = [
    {
      pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      replace: "[メール]",
    },
    {
      pattern: /[A-Z0-9._%+-]+(?:@|＠|\(at\)|\[at\]|\s?at\s?)[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      replace: "[メール]",
    },
    {
      pattern:
        /[A-Z0-9._%+-]+(?:\s*(?:@|＠|\(at\)|\[at\]|\s+at\s+)\s*)[A-Z0-9.-]+(?:\s*(?:\.|．|。)\s*[A-Z]{2,})+/gi,
      replace: "[メール]",
    },
    {
      pattern: /\b0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}\b/g,
      replace: "[電話]",
    },
    {
      pattern: /\+?\d{1,3}[- ]?\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}(?:\s?(?:内|ext\.?|x)\s?\d+)?/gi,
      replace: "[電話]",
    },
    {
      pattern:
        /(?:電話|TEL|携帯|連絡先|FAX)\s*[:：]?\s*\+?[0-9０-９]{1,3}[-－ー ]?[0-9０-９]{1,4}[-－ー ]?[0-9０-９]{1,4}[-－ー ]?[0-9０-９]{3,4}(?:\s*(?:内|ext\.?|x)\s*[0-9０-９]+)?/gi,
      replace: "[電話]",
    },
    {
      pattern: /\b\d{3}-?\d{4}\b/g,
      replace: "[郵便番号]",
    },
    {
      pattern: /〒?\s?\d{3}[-ー−]?\d{4}/g,
      replace: "[郵便番号]",
    },
    {
      pattern: /〒?\s?[０-９]{3}[ー−－]?[０-９]{4}/g,
      replace: "[郵便番号]",
    },
    {
      pattern: /\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g,
      replace: "[生年月日]",
    },
    {
      pattern: /\b\d{2}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g,
      replace: "[生年月日]",
    },
    {
      pattern: /\b\d{4}年\d{1,2}月\d{1,2}日\b/g,
      replace: "[生年月日]",
    },
    {
      pattern: /\b(明治|大正|昭和|平成|令和)\d{1,2}年\d{1,2}月\d{1,2}日\b/g,
      replace: "[生年月日]",
    },
    {
      pattern:
        /(生年月日)\s*[:：]?\s*(?:\d{4}|[０-９]{4}|(明治|大正|昭和|平成|令和)\d{1,2})[\/\-\.年]?\d{1,2}[\/\-\.月]?\d{1,2}日?/g,
      replace: "$1: [生年月日]",
    },
    {
      pattern: /(氏名|名前|患者名)\s*[:：]\s*[^\s]+/g,
      replace: "$1: [氏名]",
    },
    {
      pattern: /(氏名|名前|患者名)\s*[：:]?\s*[^\n]+/g,
      replace: "$1: [氏名]",
    },
    {
      pattern: /^(?:氏名)?\s*[一-龯々〆ヵヶ]{2,4}\s*[一-龯々〆ヵヶ]{1,4}\s*$/gm,
      replace: "[氏名]",
    },
    {
      pattern: /^(?:氏名)?\s*[A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+)+\s*$/gim,
      replace: "[氏名]",
    },
    {
      pattern: /\b[一-龯々〆ヵヶ]{1,4}(?:さん|様|氏|君)\b/g,
      replace: "[氏名]",
    },
    {
      pattern: /\b[ぁ-んァ-ヶー]{2,8}(?:さん|様|氏|君)\b/g,
      replace: "[氏名]",
    },
    {
      pattern: /\b[一-龯々〆ヵヶ]{1,4}(?:さん|様|氏|君)?\s*\d{1,3}\s*(?:歳|さい)\b/g,
      replace: "[氏名] [年齢]",
    },
    {
      pattern:
        /(?<![一-龯々〆ヵヶぁ-んァ-ヶー])[一-龯々〆ヵヶ]{2,4}(?:\s+|・)?[一-龯々〆ヵヶ]{2,4}(?![一-龯々〆ヵヶぁ-んァ-ヶー])/g,
      replace: "[氏名]",
    },
    {
      pattern:
        /(?<![A-Z])[A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+)+(?![A-Z])/g,
      replace: "[氏名]",
    },
    {
      pattern: /\b[A-Z][A-Z'\-]+,\s*[A-Z][A-Z'\-]+\b/gi,
      replace: "[氏名]",
    },
    {
      pattern: /(住所|所在地)\s*[:：]\s*[^\n]+/g,
      replace: "$1: [住所]",
    },
    {
      pattern: /(住所|所在地)\s*[：:]?\s*[^\n]+/g,
      replace: "$1: [住所]",
    },
    {
      pattern: /^(?:〒?\s?\d{3}[-ー−]?\d{4}\s*)?(?:北海道|東京都|大阪府|京都府|.{2,3}県).+$/gm,
      replace: "[住所]",
    },
    {
      pattern:
        /^(?:〒?\s?[0-9０-９]{3}[-ー−]?[0-9０-９]{4}\s*)?.*(?:市|区|町|村).*(?:丁目|番地|番|号).+$/gm,
      replace: "[住所]",
    },
    {
      pattern:
        /(ID|患者ID|患者番号|カルテ番号|カルテNo|診察券番号|診察券No)\s*[:：]?\s*[A-Z0-9０-９\-ー－_]+/gi,
      replace: "$1: [ID]",
    },
  ];

  rules.forEach(({ pattern, replace }) => {
    masked = masked.replace(pattern, replace);
  });

  return restoreDiseaseTerms(masked, protectedInfo.map);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectDiseaseTerms(text) {
  if (!diseaseListLoaded || !diseaseTerms.length) {
    return { text, map: null };
  }

  let protectedText = text;
  const map = new Map();
  let idx = 0;

  diseaseTerms.forEach((term) => {
    const token = `__KEEP_DX_${String(idx).padStart(4, "0")}__`;
    const re = new RegExp(escapeRegExp(term), "g");
    if (re.test(protectedText)) {
      protectedText = protectedText.replace(re, token);
      map.set(token, term);
      idx += 1;
    }
  });

  return { text: protectedText, map };
}

function restoreDiseaseTerms(text, map) {
  if (!map || map.size === 0) return text;

  let restored = text;
  for (const [token, term] of map.entries()) {
    restored = restored.split(token).join(term);
  }
  return restored;
}

async function loadDiseaseList() {
  try {
    const resp = await fetch("/api/disease-list");
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const data = await resp.json();
    diseaseTerms = Array.isArray(data.terms) ? data.terms : [];
    diseaseTerms = diseaseTerms
      .map((t) => String(t).trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    diseaseListLoaded = true;
  } catch (err) {
    console.warn("病名リストの読込に失敗:", err.message || err);
    diseaseTerms = [];
    diseaseListLoaded = false;
  }
}

// =========================
// 音声認識
// =========================
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

// =========================
// チャット表示
// =========================
function appendMessage(text, sender = "bot") {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// 📷 サムネイルメッセージ
function appendImageMessage(base64) {
  const row = document.createElement("div");
  row.className = "message-row user";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const img = document.createElement("img");
  img.src = `data:image/jpeg;base64,${base64}`;
  img.style.maxWidth = "120px";
  img.style.borderRadius = "8px";
  img.style.marginTop = "4px";

  bubble.textContent = "画像を受信しました：\n";
  bubble.appendChild(img);

  row.appendChild(bubble);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

// =========================
/* チャット送信（Responses API 用） */
// =========================
async function sendChat(userText) {
  if (!userText) return;
  if (isSending) return;

  isSending = true;
  const sendingText = userText; // 念のため退避
  const maskedText = maskSensitiveInfo(sendingText);
  inputEl.value = "";
  inputEl.disabled = true;
  sendButton.disabled = true;
  micButton.disabled = true;
  setStatus("LLMと通信中です…");

  // 画面表示用
  messages.push({ role: "user", content: maskedText });
  appendMessage(maskedText, "user");

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userText: maskedText,
        previousResponseId, // 前回のレスポンスIDを渡す
      }),
    });

    if (!resp.ok) throw new Error("chat API error");

    const data = await resp.json();
    const reply = data.reply || "";

    // 次回用の previousResponseId を更新
    if (data.responseId) {
      previousResponseId = data.responseId;
    }

    messages.push({ role: "assistant", content: reply });
    appendMessage(reply, "bot");

    // 紹介状が生成されたかどうか判定
    const marker = "紹介状:";
    if (reply.includes(marker)) {
      // 「紹介状:」が出てくる位置を探す
      const idx = reply.indexOf(marker);
      // その後ろ（紹介状: を含めない）から末尾までを紹介状本文として扱う
      const letterBody = reply.slice(idx + marker.length).trimStart();
      const inputCostUSD  = totalInputTokens  * 0.00000025;
      const outputCostUSD = totalOutputTokens * 0.000002;
      const totalUSD = inputCostUSD + outputCostUSD;

      lastLetterText = letterBody;
      copyButton.disabled = false;
      emailButton.disabled = false;
      appendMessage(
      `💰 この症例にかかった推定コスト\n` +
      `Input tokens: ${totalInputTokens}\n` +
      `Output tokens: ${totalOutputTokens}\n` +
      `USD: $${totalUSD.toFixed(6)}\n`,
      "bot"
    );
      setStatus(
        "紹介状案が生成されました。コピーまたはメール送信できます。"
      );
    } else {
      setStatus("");
    }
  } catch (err) {
    console.error(err);
    appendMessage(
      "エラーが発生しました。もう一度お試しください。",
      "bot"
    );
    setStatus("通信エラー");
  } finally {
    isSending = false;
    inputEl.disabled = false;
    sendButton.disabled = false;
    micButton.disabled = false;
    inputEl.focus();
  }
}

// =========================
/* 音声認識 */
// =========================
function setupSpeechRecognition() {
  if (!recognition) {
    micButton.disabled = true;
    return;
  }

  micButton.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      isListening = true;
      micButton.textContent = "🛑";
      setStatus("音声認識中…");
    } catch (e) {
      console.error(e);
    }
  });

  recognition.addEventListener("result", async (event) => {
    const transcript = event.results[0][0].transcript;
    try {
      const resp = await fetch("/api/clean-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: transcript }),
      });
      const data = await resp.json();
      const cleaned = data.cleanedText || transcript;

      inputEl.value = inputEl.value
        ? inputEl.value + " " + cleaned
        : cleaned;

      setStatus("音声入力を反映しました。");
    } catch (err) {
      console.error(err);
      inputEl.value = transcript;
      setStatus("音声校正に失敗しました。");
    }
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    micButton.textContent = "🎙";
  });
}
// =========================
// 🧹 症例リセットボタン
// =========================
resetCaseButton.addEventListener("click", () => {
  const ok = window.confirm(
    "現在の会話（症例）の内容をリセットして、新しい症例を開始します。よろしいですか？"
  );
  if (!ok) {
    // キャンセルされたら何もしない
    return;
  }

  // LLM の会話文脈をリセット
  previousResponseId = null;

  // チャット画面もリセット
  messages = [];
  chatEl.innerHTML = "";

  // ステータス変更
  setStatus("新しい症例を開始します。初期メッセージを取得中…");

  // 初期プロンプトを再取得（init と同じ動き）
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isInitial: true,
      previousResponseId: null,
    }),
  })
    .then((resp) => resp.json())
    .then((data) => {
      const reply = data.reply || "";
      messages.push({ role: "assistant", content: reply });
      appendMessage(reply, "bot");
      previousResponseId = data.responseId || null;
      setStatus("");
    })
    .catch((err) => {
      console.error(err);
      appendMessage("初期メッセージの取得に失敗しました。", "bot");
      setStatus("初期化エラー");
    });
});


// =========================
/* フィードバックボタン */
// =========================
feedbackButton.addEventListener("click", () => {
  // 別タブで Google フォームを開く
  window.open(
    "https://forms.gle/pjRzgGo4omZKviot5",
    "_blank",
    "noopener"
  );
  setStatus(
    "ブラウザの別タブでフィードバック用フォームが開きます。"
  );
});
if (usageButton) {
  usageButton.addEventListener("click", () => {
    // ★ここに実際のYouTube動画URLを入れてください
    const url = "https://www.youtube.com/watch?v=oiWcKRreQ28";

    window.open(url, "_blank", "noopener");
    setStatus("使い方動画を別タブで開きました。");
  });
}

// =========================
/* 📷 画像 → OCR */
// =========================
imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  setStatus("📸 画像処理中…");

  // File → Base64
  const base64 = await fileToBase64(file);

  await runOcrWithBase64(base64);

  imageInput.value = "";
});

// Base64変換
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function runOcrWithBase64(base64) {
  // サムネイルをチャットに表示
  appendImageMessage(base64);

  try {
    const resp = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });

    const data = await resp.json();

    if (data.error) {
      setStatus("OCR エラー：" + data.error);
      return;
    }

    const ocrText = data.ocrText;

    appendMessage("【OCR結果】\n" + ocrText, "bot");
    inputEl.value = ocrText;

    setStatus("OCR結果を入力欄に反映しました。");
  } catch (err) {
    console.error(err);
    setStatus("OCR通信エラー");
  }
}

// =========================
/* クリップボード画像貼り付け */
// =========================
inputEl.addEventListener("paste", async (event) => {
  const items = event.clipboardData?.items;
  if (!items) return;

  const imageItem = Array.from(items).find(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
  if (!imageItem) return;

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;

  setStatus("📋 画像貼り付けを処理中…");
  const base64 = await fileToBase64(file);
  await runOcrWithBase64(base64);
});

// =========================
/* 紹介状コピー */
// =========================
copyButton.addEventListener("click", async () => {
  if (!lastLetterText) return;
  await navigator.clipboard.writeText(lastLetterText);
  setStatus("紹介状をクリップボードにコピーしました。");
});

// =========================
/* 紹介状作成（現時点の会話から下書き） */
// =========================
draftButton.addEventListener("click", async () => {
  if (isSending) return;
  if (!messages.length) {
    setStatus("会話内容がありません。");
    return;
  }

  isSending = true;
  draftButton.disabled = true;
  setStatus("紹介状案を作成中…");

  const conversation = messages
    .filter((m) => typeof m.content === "string")
    .filter((m) => !m.content.startsWith("💰"))
    .map((m) => `${m.role === "user" ? "ユーザー" : "ボット"}: ${m.content}`)
    .join("\n");

  try {
    const resp = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation }),
    });

    if (!resp.ok) throw new Error("draft API error");

    const data = await resp.json();
    const reply = data.reply || "";

    messages.push({ role: "assistant", content: reply });
    appendMessage(reply, "bot");

    const marker = "紹介状:";
    if (reply.includes(marker)) {
      const idx = reply.indexOf(marker);
      const letterBody = reply.slice(idx + marker.length).trimStart();
      lastLetterText = letterBody;
      copyButton.disabled = false;
      emailButton.disabled = false;
    }

    setStatus("紹介状案を作成しました。");
  } catch (err) {
    console.error(err);
    appendMessage(
      "紹介状案の作成に失敗しました。もう一度お試しください。",
      "bot"
    );
    setStatus("作成エラー");
  } finally {
    isSending = false;
    draftButton.disabled = false;
  }
});

// =========================
/* メール作成（ローカルのメールクライアントを開く） */
// =========================
emailButton.addEventListener("click", () => {
  if (!lastLetterText) return;

  // 件名と本文をエンコード
  const subject = encodeURIComponent("腎臓内科紹介状");
  const body = encodeURIComponent(lastLetterText);

  // 宛先：固定にする場合はここにメールアドレスを書く
  const to = "renkei@hospital.jp"; // 必要に応じて変更

  // 利用者の端末のメールクライアントで新規メール作成
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;

  setStatus(
    "メール作成画面を開きました。内容をご確認のうえ送信してください。"
  );
});

// =========================
/* フォーム送信 */
// =========================
formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  sendChat(text);
});

// =========================
/* 初期化（Responses API 用：isInitial フラグ） */
// =========================
function init() {
  setupSpeechRecognition();
  loadDiseaseList();
  setStatus("初期メッセージ生成中…");

  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isInitial: true,           // 初期メッセージフラグ
      previousResponseId: null,  // まだ会話履歴なし
    }),
  })
    .then((resp) => resp.json())
    .then((data) => {
      const reply = data.reply || "";
      messages.push({ role: "assistant", content: reply });
      appendMessage(reply, "bot");

      if (data.responseId) {
        previousResponseId = data.responseId;
      }

      setStatus("");
    })
    .catch((err) => {
      console.error(err);
      appendMessage(
        "初期メッセージの取得に失敗しました。ページを再読み込みしてください。",
        "bot"
      );
      setStatus("初期化エラー");
    });
}

init();
