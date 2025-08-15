// Ключ Hugging Face хранится как переменная окружения HF_TOKEN (Site settings → Environment variables)

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Use POST" })
      };
    }

    const hf = process.env.HF_TOKEN;
    if (!hf) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing HF_TOKEN",
          context: process.env.CONTEXT || null,
          branch: process.env.BRANCH || null
        })
      };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}

    const topic = String(body.topic ?? "плов").slice(0,120);
    const style = String(body.style ?? "мудрый").slice(0,50);
    const lang  = String(body.lang  ?? "ru").slice(0,8);

    const prompt =
`Придумай одну очень короткую народную пословицу.
Тема: "${topic}". Стиль: "${style}". Язык: ${lang}.
До 12 слов. Без политики и оскорблений. Верни только пословицу.`;

    const resp = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${hf}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 32, temperature: 0.9 }
      })
    });

    const txt = await resp.text();

    if (!resp.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "HF error", details: txt })
      };
    }

    let out;
    try { out = JSON.parse(txt); } catch { out = txt; }
    const raw = Array.isArray(out) ? (out[0]?.generated_text || "") : (out?.generated_text || out || "");
    const proverb = String(raw).split("\n").pop().trim().replace(/^["'«»]+|["'«»]+$/g, "");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proverb })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error", details: String(e) })
    };
  }
};
