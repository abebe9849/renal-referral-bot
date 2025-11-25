// server.js
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// OpenAI クライアント（Responses API 用）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==============================
// Markdown ガイドライン読込
// ==============================
const markdownDir = path.join(__dirname, "markdown");
const infoMd = fs.readFileSync(
  path.join(markdownDir, "紹介状に必要な情報.md"),
  "utf8"
);
const criteriaMd = fs.readFileSync(
  path.join(markdownDir, "紹介基準.md"),
  "utf8"
);
const urgencyMd = fs.readFileSync(
  path.join(markdownDir, "紹介の緊急度.md"),
  "utf8"
);

let medicalDictMd = "";
try {
  medicalDictMd = fs.readFileSync(
    path.join(markdownDir, "医療用頻出単語_腎臓内科.md"),
    "utf8"
  );
} catch (e) {
  console.error("医療用頻出単語_腎臓内科.md が読めません:", e.message);
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

/* =========================================================
   1) 音声 → テキスト校正（単発なので previous_response_id なし）
========================================================= */
app.post("/api/clean-text", async (req, res) => {
  try {
    const { rawText } = req.body || {};
    if (!rawText) {
      return res.status(400).json({ error: "rawText がありません。" });
    }

    const prompt = `
以下は日本語の医療情報（病歴・検査値など）です。
音声認識の誤変換を可能な範囲で修正し、意味が変わらない自然な文章に整形してください。

▼厳守ルール
- 数値・単位は明らかな誤り以外は変更しない
- 薬剤名・病名は、以下の辞書（医療用頻出語）に可能な限り合わせる
- 不明語は削除せず残す

[医療単語の辞書]
${medicalDictMd}

【入力】  
${rawText}

【出力】修正後のテキストのみ
    `.trim();

    const completion = await openai.responses.create({
      model: "gpt-5-mini", // 必要なら "gpt-5-mini" などに変更
      instructions: "あなたは日本語医療文書の校正専門家です。",
      input: prompt, // ★ Responses API では input に文字列でOK
      reasoning: { effort: "none" },
    });

    const cleaned = completion.output_text?.trim() || rawText;
    res.json({ cleanedText: cleaned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "clean-text エラー" });
  }
});

/* =========================================================
   2) 対話式チャット（紹介状作成）
   - フロントから:
     { userText, previousResponseId, isInitial }
   - previousResponseId を Responses API の previous_response_id に渡して会話継続
========================================================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { userText, previousResponseId, isInitial } = req.body || {};

    const systemPrompt = `
あなたは日本の腎臓内科専門医であり、「紹介状作成支援チャットボット」として振る舞います。
ユーザーは地域のクリニックの医師であり、腎機能低下などの症例について相談します。

以下の3つのMarkdown文書をガイドラインとして厳密に参考にしてください。

[紹介状に必要な情報]
${infoMd}

[紹介基準]
${criteriaMd}

[紹介の緊急度]
${urgencyMd}

## あなたの役割

1. まず「紹介状に必要な情報」に基づき、漏れがないように1〜2項目ずつ丁寧に質問しながら情報を集めてください。
   - 病歴・症状の自由記載や、検査値の時系列の貼り付けも歓迎すること。
   - 一度に聞き過ぎず、会話形式で進めること。

2. 情報がある程度揃ったと判断したら、以下の3点をまとめてユーザーに提示してください。
   - (A) 紹介を「強く推奨 / 推奨 / 相談レベル / 経過観察も選択肢」のどれくらいと判断するか
   - (B) 「紹介の緊急度.md」に基づく推奨受診タイミング（例：「当日〜数日以内」「1〜2週間以内」「通常の予約で可」）
   - (C) 簡潔な根拠（数行）

   そのうえで、最後に必ず
   「▶ この症例を腎臓内科へ紹介されますか？（紹介する／今回は見送る）」と確認してください。

3. ユーザーが「紹介する」などと答えた場合
   - それまでの会話内容をもとに、腎臓内科宛の紹介状案を作成してください。
   - 形式：
     - 冒頭に『紹介状:』と書く
     - 宛先（○○病院 腎臓内科  ○○先生 御侍史）
     - 患者基本情報（年齢・性別）
     - 紹介理由
     - 現病歴
     - 検査所見（時系列があれば要約）
     - 既往歴・内服
     - 考えられる鑑別・相談したいポイント
     - 締めの挨拶（○○クリニック ○○ 拝）
   - 「紹介状:」以降は、紹介状本文のみを出力してください（説明文や会話は含めない）。

4. ユーザーが「今回は見送る」などと判断した場合
   - 経過観察の際の注意点や、再紹介の目安を簡潔に助言してください。

5. 会話全体を通じて、できるだけ簡潔で、忙しい臨床医に読みやすい日本語で対応してください。
    `.trim();

    // 初回アクセス用の入力
    let inputText = userText;
    if (isInitial) {
      inputText = `
これから腎臓内科への紹介が必要かどうかを一緒に検討します。
まず、患者さんの年齢・性別と、腎機能異常に気づいたきっかけを教えてください。
      `.trim();
    }

    if (!inputText && !previousResponseId) {
      return res
        .status(400)
        .json({ error: "userText か previousResponseId のいずれかが必要です。" });
    }

    const resp = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: systemPrompt,
      input: inputText || undefined, // previous_response_id のみ指定で続きを聞くこともできるが、基本は常に input を渡す
      ...(previousResponseId
        ? { previous_response_id: previousResponseId }
        : {}),
      reasoning: { effort: "minimal" },
    });

    const reply = resp.output_text ?? "";
    // フロントで次回呼び出し時に使うため、resp.id を返す
    res.json({ reply, responseId: resp.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat エラー" });
  }
});

/* =========================================================
   3) OCR（画像 → テキスト → 医療文書として整形）
   - フロントから: { imageBase64 }
========================================================= */
app.post("/api/ocr", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 がありません。" });
    }

    // ---- Step1: 画像から文字を読む（Responses API + input_image） ----
    const visionResp = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
あなたは日本語のOCR専門家です。
以下の画像には、お薬手帳や検査結果などの医療情報が含まれています。
読み取れる文字を可能な範囲で正確に抽出してください。
出力は純粋なテキストのみ（説明やコメントは不要）とします。
              `.trim(),
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBase64}`,
            },
          ],
        },
      ],
      reasoning: { effort: "minimal" },
    });

    const rawOcr = visionResp.output_text?.trim() || "";

    // ---- Step2: OCR結果を医療文書として校正・整形 ----
    const prompt = `
以下は OCR で抽出された日本語テキストです。
誤字・OCR誤認識を自然な医療文章に整形してください。
以下の医療単語の辞書も参考にしてください。

[医療単語の辞書]
${medicalDictMd}

【入力】
${rawOcr}

【出力】
    `.trim();

    const correctedResp = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: "あなたは日本語の医療文書の校正者です。",
      input: prompt,
      reasoning: { effort: "minimal" },
    });

    const cleaned = correctedResp.output_text?.trim() || rawOcr;
    res.json({ ocrText: cleaned });
  } catch (err) {
    console.error("OCR エラー:", err);
    res.status(500).json({ error: "ocr エラー" });
  }
});

// ==============================
// サーバ起動
// ==============================
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
