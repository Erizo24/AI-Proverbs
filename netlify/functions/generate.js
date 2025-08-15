// netlify/functions/generate.js
export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const { topic = "плов", style = "мудрый", lang = "ru" } = await req.json();

    // ===== 1) Сначала пробуем OpenAI для текста =====
    let proverb = null;
    let openAiErr = null;

    const oaiKey = process.env.OPENAI_API_KEY;
    if (oaiKey) {
      try {
        const sys = `Ты создаёшь очень короткие народные поговорки. Без политики и оскорблений. До 12 слов.`;
        const user = `Тема: "${topic}". Стиль: "${style}". Язык ответа: ${lang}.
Верни только одну поговорку одной строкой, без кавычек и комментариев.`;

        const modelsToTry = ["gpt-4o-mini", "gpt-4o-mini-2024-07-18", "gpt-3.5-turbo"];
        let chatData = null, lastTxt = null;

        for (const m of modelsToTry) {
          const chatResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${oaiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: m,
              temperature: 0.9,
              messages: [
                { role: "system", content: sys },
                { role: "user", content: user }
              ]
            })
          });
          const raw = await chatResp.text();
          lastTxt = raw;
          if (chatResp.ok) {
            chatData = JSON.parse(raw);
            break;
          }
        }

        if (chatData) {
          proverb = (chatData?.choices?.[0]?.message?.content || "").trim();
          // убираем кавычки, если вдруг модель вернёт
          proverb = proverb.replace(/^["'«»]+|["'«»]+$/g, "");
        } else {
          openAiErr = "OpenAI chat failed. " + (lastTxt || "");
        }
      } catch (e) {
        openAiErr = "OpenAI chat exception: " + String(e);
      }
    } else {
      openAiErr = "Missing OPENAI_API_KEY";
    }

    // ===== 2) Если OpenAI-текст не получился — фолбэк на HuggingFace =====
    if (!proverb) {
      const hf = process.env.HF_TOKEN;
      if (!hf) {
        // нет и фолбэка — вернём ошибку, фронт даст ввести вручную
        return new Response(JSON.stringify({
          error: "LLM chat error",
          details: openAiErr || "No text provider available (set OPENAI_API_KEY or HF_TOKEN)"
        }), { status: 500 });
      }

      try {
        const prompt = `Придумай одну очень короткую народную пословицу. Тема: "${topic}". Стиль: "${style}". Язык: ${lang}. До 12 слов. Без политики и оскорблений. Верни только пословицу.`;
        const resp = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
          method: "POST",
          headers: { "Authorization": `Bearer ${hf}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 32, temperature: 0.9 } })
        });
        const txt = await resp.text();
        if (!resp.ok) {
          return new Response(JSON.stringify({ error: "HF error", details: txt }), { status: 500 });
        }
        let out;
        try { out = JSON.parse(txt); } catch { out = txt; }
        const raw = Array.isArray(out) ? (out[0]?.generated_text || "") : (out?.generated_text || out || "");
        proverb = String(raw).split("\n").pop().trim().replace(/^["'«»]+|["'«»]+$/g, "");
      } catch (e) {
        return new Response(JSON.stringify({ error: "HF exception", details: String(e) }), { status: 500 });
      }
    }

    // ===== 3) Попробуем OpenAI Images для фона (необязательно) =====
    let image_url = null;
    if (oaiKey) {
      try {
        const imgPrompt = `Create a clean, high-quality background image that reflects the theme "${topic}" in a ${style} mood. 
No text, no watermarks, no people faces close-up. Soft lighting, composition suitable for a poster background.`;
        const imgResp = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${oaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: imgPrompt, size: "1024x1024", n: 1 })
        });
        if (imgResp.ok) {
          const imgData = await imgResp.json();
          image_url = imgData?.data?.[0]?.url || null;
        }
        // если не ок — спокойно вернем null, фронт нарисует градиент
      } catch (_) { /* тихий фолбэк */ }
    }

    return new Response(JSON.stringify({ proverb, image_url }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), { status: 500 });
  }
};
