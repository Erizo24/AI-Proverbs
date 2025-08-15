// netlify/functions/generate.js
// Провайдер: Hugging Face Inference API (только текст).
// Храните токен в переменной окружения HF_TOKEN на Netlify.
// Не требует OpenAI и не светит ключ в браузер.

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405, headers: { "Content-Type": "application/json" }
      });
    }

    const hf = process.env.HF_TOKEN;
    if (!hf) {
      return new Response(JSON.stringify({ error: "Missing HF_TOKEN" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    let body;
    try { body = await req.json(); }
    catch { body = {}; }

    const topic = (body?.topic ?? "плов").toString().slice(0, 120);
    const style = (body?.style ?? "мудрый").toString().slice(0, 50);
    const lang  = (body?.lang  ?? "ru").toString().slice(0, 8);

    const prompt =
`Придумай одну очень короткую народную пословицу.
Тема: "${topic}". Стиль: "${style}". Язык: ${lang}.
До 12 слов. Без политики и оскорблений. Верни только пословицу.`;

    const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
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

    const txt = await r.text();

    if (!r.ok) {
      // отдадим наружу «как есть» для быстрой диагностики
      return new Response(JSON.stringify({ error: "HF error", details: txt }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    // возможные форматы ответа: массив [{ generated_text }], либо объект { generated_text }
    let out;
    try { out = JSON.parse(txt); } catch { out = txt; }
    const raw = Array.isArray(out) ? (out[0]?.generated_text || "") : (out?.generated_text || out || "");
    const proverb = String(raw).split("\n").pop().trim().replace(/^["'«»]+|["'«»]+$/g, "");

    return new Response(JSON.stringify({ proverb }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", details: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
