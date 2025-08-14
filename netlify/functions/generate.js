// netlify/functions/generate.js
export default async (req, ctx) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
    }

    const { topic = "плов", style = "мудрый", lang = "ru" } = await req.json();

    // 1) короткая поговорка
    const sys = `Ты создаёшь очень короткие народные поговорки. Без политики и оскорблений. До 12 слов.`;
    const user = `Тема: "${topic}". Стиль: "${style}". Язык ответа: ${lang}.
Верни только одну поговорку одной строкой, без кавычек и комментариев.`;

    const chatResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      })
    });

    if (!chatResp.ok) {
      const e = await chatResp.text();
      return new Response(JSON.stringify({ error: "LLM chat error", details: e }), { status: 500 });
    }

    const chatData = await chatResp.json();
    const proverb = (chatData?.choices?.[0]?.message?.content || "").trim();

    // 2) фон-картинка (без текста) — необязательно; если не получится, вернём только поговорку
    const imgPrompt = `Create a clean, high-quality background image that reflects the theme "${topic}" in a ${style} mood. 
No text, no watermarks, no people faces close-up. Soft lighting, composition suitable for a poster background.`;

    const imgResp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: imgPrompt,
        size: "1024x1024",
        n: 1
      })
    });

    let image_url = null;
    if (imgResp.ok) {
      const imgData = await imgResp.json();
      image_url = imgData?.data?.[0]?.url || null;
    }

    return new Response(JSON.stringify({ proverb, image_url }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500 });
  }
};
