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
const feedbackButton = document.getElementById("feedbackButton");
// =========================
// グローバル変数
// =========================
let messages = [];
let isSending = false;
let lastLetterText = null;

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
// チャット送信
// =========================
async function sendChat(userText) {
  if (!userText) return;
  if (isSending) return;

  isSending = true;
  inputEl.value = "";
  inputEl.disabled = true;
  sendButton.disabled = true;
  micButton.disabled = true;
  setStatus("LLMと通信中です…");

  messages.push({ role: "user", content: userText });
  appendMessage(userText, "user");

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!resp.ok) throw new Error("chat API error");

    const data = await resp.json();
    const reply = data.reply || "";

    messages.push({ role: "assistant", content: reply });
    appendMessage(reply, "bot");

    if (reply.startsWith("紹介状:")) {
      lastLetterText = reply.replace(/^紹介状:\s*/, "");
      copyButton.disabled = false;
      emailButton.disabled = false;
      setStatus("紹介状案が生成されました。コピーまたはメール送信できます。");
    } else {
      setStatus("");
    }
  } catch (err) {
    console.error(err);
    appendMessage("エラーが発生しました。もう一度お試しください。", "bot");
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
// 音声認識
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
      inputEl.value = transcript;
      setStatus("音声校正に失敗しました。");
    }
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    micButton.textContent = "🎙";
  });
}
feedbackButton.addEventListener("click", () => {
  // 別タブで Google フォームを開く
  window.open(
    "https://forms.gle/pjRzgGo4omZKviot5",
    "_blank",
    "noopener"
  );
  // ついでにステータス表示もしておくと親切
  setStatus("ブラウザの別タブでフィードバック用フォームが開きます。");
});
// =========================
// 📷 画像 → OCR
// =========================
imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;

  setStatus("📸 画像処理中…");

  // File → Base64
  const base64 = await fileToBase64(file);

  // サムネイルをチャットに表示
  appendImageMessage(base64);

  try {
    const resp = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 })
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

// =========================
// 紹介状コピー
// =========================
copyButton.addEventListener("click", async () => {
  if (!lastLetterText) return;
  await navigator.clipboard.writeText(lastLetterText);
  setStatus("コピーしました。");
});

// =========================
// メール送信
// =========================
emailButton.addEventListener("click", async () => {
  if (!lastLetterText) return;

  setStatus("メール送信中…");

  try {
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letterText: lastLetterText }),
    });
    setStatus("送信依頼を送信しました。");
  } catch (err) {
    setStatus("メール送信エラー");
  }
});

// =========================
// フォーム送信
// =========================
formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  sendChat(text);
});

// =========================
// 初期化
// =========================
function init() {
  setupSpeechRecognition();
  setStatus("初期メッセージ生成中…");

  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  })
    .then((resp) => resp.json())
    .then((data) => {
      const reply = data.reply || "";
      messages.push({ role: "assistant", content: reply });
      appendMessage(reply, "bot");
      setStatus("");
    });
}

init();
