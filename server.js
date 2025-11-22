// server.js
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// OpenAI クライアント
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ガイドラインの読み込み
const markdownDir = path.join(__dirname, "markdown");
const infoMd = fs.readFileSync(path.join(markdownDir, "紹介状に必要な情報.md"), "utf8");
const criteriaMd = fs.readFileSync(path.join(markdownDir, "紹介基準.md"), "utf8");
const urgencyMd = fs.readFileSync(path.join(markdownDir, "紹介の緊急度.md"), "utf8");
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
app.use(express.json());
app.use(express.static("public"));

// ========== 1) 音声→テキストの誤字修正 API ==========
app.post("/api/clean-text", async (req, res) => {
  try {
    const { rawText } = req.body || {};
    if (!rawText) {
      return res.status(400).json({ error: "rawText がありません。" });
    }

    const prompt = `
あなたは日本語の医療文書専門の校正AIです。
以下は音声認識から得られたテキストであり、医療用語や薬剤名、検査値の単位などが誤変換されている可能性があります。

【医療用頻出単語の辞書】
${medicalDictMd}

■タスク
- 上記の医療用語辞書を優先的に参照しながら、誤変換された医療用語や薬剤名を適切な表記に修正してください。
- 検査値の数字や単位（mg/dL, mmol/L, g/gCr など）が明らかにおかしい場合は文脈から自然な形に整えてください。
- ただし「推測して創作する」のではなく、元の意味を変えない範囲での修正にとどめてください。
- 文の意味が変わらないようにしつつ、日本語として読みやすい医療文にしてください。
- 出力は【修正後テキスト】のみを返し、説明やコメントは一切書かないでください。

【入力テキスト】
${rawText}

【修正後テキスト】
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-5.0-mini",
      messages: [
        { role: "system", content: "あなたは日本語の医療文書の校正者です。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    });

    const cleaned = completion.choices[0]?.message?.content?.trim() || rawText;
    res.json({ cleanedText: cleaned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "clean-text エラー" });
  }
});


// ========== 2) チャット本体 API（LLM＋ガイドライン参照） ==========
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages 配列が必要です。" });
    }

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
     - 宛先（○○病院 腎臓内科 御中）
     - 患者基本情報（年齢・性別）
     - 紹介理由
     - 現病歴
     - 検査所見（時系列があれば要約）
     - 既往歴・内服
     - 考えられる鑑別・相談したいポイント
     - 締めの挨拶
   - 「紹介状:」以降は、紹介状本文のみを出力してください（説明文や会話は含めない）。

4. ユーザーが「今回は見送る」などと判断した場合
   - 経過観察の際の注意点や、再紹介の目安を簡潔に助言してください。

5. 会話全体を通じて、できるだけ簡潔で、忙しい臨床医に読みやすい日本語で対応してください。
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-5.0-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.3,
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat エラー" });
  }
});
// ========== 3) OCR（画像 → テキスト抽出） ==========
app.post("/api/ocr", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 がありません。" });
    }

    // Vision OCR プロンプト
    const visionPrompt = `
あなたは医療文書を読み取るOCRシステムです。
画像には以下が含まれる可能性があります：

- 検診結果（健康診断結果、血液検査）
- お薬手帳（薬剤名、処方量、処方日）
- 検査の時系列データ
- 血圧手帳、血糖記録
- 病院のレシート型検査結果

■タスク
- 画像から読み取れる文字を忠実に抽出する
- 表形式の検査値は、「項目: 値」の形で列挙
- 誤認識が疑われる場合でも勝手に補完しない
- 説明をつけず、抽出テキストのみ返す
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "user",
          content: [
            { type: "text", text: visionPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.0,
    });

    const ocrText = completion.choices[0].message.content.trim();

    const cleaned = await cleanTextWithLLM(ocrText); 
res.json({ ocrText: cleaned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "OCR エラー" });
  }
});

// サーバー起動
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
