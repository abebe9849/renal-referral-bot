// public/app.js

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("form");
const inputEl = document.getElementById("input");
const statusEl = document.getElementById("status");
const sendButton = document.getElementById("sendButton");
const micButton = document.getElementById("micButton");
const copyButton = document.getElementById("copyButton");
const emailButton = document.getElementById("emailButton");

// LLM との会話履歴（サーバーにそのまま渡す）
let messages = [];
let isSending = false;
let lastLetterText = null;

// 音声認識セットアップ
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

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function sendChat(userText) {
  if (!userText) return;
  if (isSending) return;

  isSending = true;
  inputEl.value = "";
  inputEl.disabled = true;
  sendButton.disabled = true;
  micButton.disabled = true;
  setStatus("LLMと通信中です…");

  // 会話履歴にユーザー発言を追加
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

    // LLMからの応答を履歴に追加
    messages.push({ role: "assistant", content: reply });
    appendMessage(reply, "bot");

    // 「紹介状:」で始まる場合は紹介状とみなす
    if (reply.startsWith("紹介状:")) {
      lastLetterText = reply.replace(/^紹介状:\s*/, "");
      copyButton.disabled = false;
      emailButton.disabled = false;
      setStatus("紹介状案が生成されました。コピーまたはメール送信を選択できます。");
    } else {
      setStatus("");
    }
  } catch (err) {
    console.error(err);
    appendMessage(
      "申し訳ありません。サーバーまたはLLMとの通信でエラーが発生しました。",
      "bot"
    );
    setStatus("エラーが発生しました。");
  } finally {
    isSending = false;
    inputEl.disabled = false;
    sendButton.disabled = false;
    micButton.disabled = false;
    inputEl.focus();
  }
}

// 音声認識ハンドラ
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
      setStatus("音声認識中… 話し終わったら数秒待ってください。");
    } catch (e) {
      console.error(e);
    }
  });

  recognition.addEventListener("result", async (event) => {
    const transcript = event.results[0][0].transcript;
    try {
      // LLM で誤変換修正
      const resp = await fetch("/api/clean-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: transcript }),
      });
      if (!resp.ok) throw new Error("clean-text error");
      const data = await resp.json();
      const cleaned = data.cleanedText || transcript;

      // 既存入力に追記
      if (inputEl.value) {
        inputEl.value = inputEl.value + " " + cleaned;
      } else {
        inputEl.value = cleaned;
      }
      setStatus("音声入力の文字起こしを反映しました。必要に応じて修正のうえ送信してください。");
    } catch (err) {
      console.error(err);
      inputEl.value = transcript;
      setStatus("音声認識結果の校正に失敗しました（元の結果をそのまま表示しています）。");
    }
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    micButton.textContent = "🎙";
  });

  recognition.addEventListener("error", (event) => {
    console.error("Speech recognition error:", event.error);
    isListening = false;
    micButton.textContent = "🎙";
    setStatus("音声認識でエラーが発生しました。");
  });
}

// 紹介状コピー
copyButton.addEventListener("click", async () => {
  if (!lastLetterText) return;
  try {
    await navigator.clipboard.writeText(lastLetterText);
    setStatus("紹介状をクリップボードにコピーしました。カルテや紹介状システムに貼り付けてご利用ください。");
  } catch (err) {
    console.error(err);
    setStatus("コピーに失敗しました。ブラウザの制限の可能性があります。");
  }
});

// 紹介状メール送信
emailButton.addEventListener("click", async () => {
  if (!lastLetterText) return;
  setStatus("紹介状をメール送信中です…");
  emailButton.disabled = true;
  try {
    const resp = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letterText: lastLetterText }),
    });
    if (!resp.ok) throw new Error("email error");
    setStatus("紹介状のメール送信リクエストを送信しました。実際の送信状況はメールサーバー側でご確認ください。");
  } catch (err) {
    console.error(err);
    setStatus("メール送信エラーが発生しました。設定を確認してください。");
  } finally {
    emailButton.disabled = false;
  }
});

// フォーム送信
formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  sendChat(text);
});

// 初期化：最初のボットメッセージ
function init() {
  setupSpeechRecognition();

  // 最初の assistant メッセージを LLM に生成させる（紹介状に必要な情報の提示＋最初の質問）
  messages = [];
  setStatus("初期メッセージを生成中です…");

  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }), // 最初は空
  })
    .then((resp) => resp.json())
    .then((data) => {
      const reply = data.reply || "";
      messages.push({ role: "assistant", content: reply });
      appendMessage(reply, "bot");
      setStatus("");
    })
    .catch((err) => {
      console.error(err);
      appendMessage(
        "チャットの初期化に失敗しました。ページを再読み込みするか、時間をおいて再度お試しください。",
        "bot"
      );
      setStatus("初期化エラー");
    });
}

init();
