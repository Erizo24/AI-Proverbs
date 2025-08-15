// netlify/functions/generate.js
// Единственный провайдер: Hugging Face Inference API.
// Требуется переменная окружения HF_TOKEN (https://huggingface.co/settings/tokens)

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const hf = process.env.HF_TOKEN;
    if (!hf) {
      return new Response(JSON.stringify({ error: "Missing HF_TOKEN" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    const { topic = "плов", style = "мудрый", lang = "ru" } = await req.json();

    const prompt =
`Придумай одну очень короткую народную пословицу.
Тема: "${topic}". Стиль: "${style}". Язык: ${lang}.
До 12 слов. Без политики и оскорблений. Верни только пословицу.`;

    // Можно заменить модель на другую инструктивную, если захочешь
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
      return new Response(JSON.stringify({ error: "HF error", details: txt }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    let out;
    try { out = JSON.parse(txt); } catch { out = txt; }

    const raw = Array.isArray(out)
      ? (out[0]?.generated_text || "")
      : (out?.generated_text || out || "");

    const proverb = String(raw)
      .split("\n").pop().trim()
      .replace(/^["'«»]+|["'«»]+$/g, "");

    return new Response(JSON.stringify({ proverb, image_url: null }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", details: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
