// netlify/functions/generate.js
// Текст: сначала OpenAI, при любой проблеме — фолбэк на Hugging Face.
// Картинку не запрашиваем — фронт рисует градиент (надёжно для демо).

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const { topic = "плов", style = "мудрый", lang = "ru" } = await req.json();

    const systemMsg = "Ты создаёшь очень короткие народные поговорки. Без политики и оскорблений. До 12 слов.";
    const userMsg = `Тема: "${topic}". Стиль: "${style}". Язык ответа: ${lang}.
Верни только одну поговорку одной строкой, без кавычек и комментариев.`;

    let proverb = null;
    let openAiErr = null;

    // ===== 1) Пытаемся через OpenAI (если есть ключ)
    const oaiKey = process.env.OPENAI_API_KEY;
    if (oaiKey) {
      try {
        // Несколько моделей на случай, если одна недоступна
        const models = ["gpt-4o-mini", "gpt-4o-mini-2024-07-18", "gpt-3.5-turbo"];
        let ok = false, lastRaw = null;

        for (const model of models) {
          const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${oaiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              temperature: 0.9,
              messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: userMsg }
              ]
            })
          });

          const raw = await resp.text();
          lastRaw = raw;

          if (resp.ok) {
            const data = JSON.parse(raw);
            proverb = (data?.choices?.[0]?.message?.content || "").trim().replace(/^["'«»]+|["'«»]+$/g, "");
            ok = true;
            break;
          } else {
            // если квота кончилась — сразу уходим на фолбэк
            if (raw.includes("insufficient_quota")) {
              openAiErr = "OpenAI insufficient_quota";
              break;
            }
          }
        }

        if (!ok && !openAiErr) {
          openAiErr = "OpenAI chat failed. " + (lastRaw || "");
        }
      } catch (e) {
        openAiErr = "OpenAI exception: " + String(e);
      }
    } else {
      openAiErr = "Missing OPENAI_API_KEY";
    }

    // ===== 2) Если поговорку не получили — фолбэк HuggingFace (если есть токен)
    if (!proverb) {
      const hf = process.env.HF_TOKEN;
      if (!hf) {
        // Нет фолбэка — возвращаем ошибку (фронт позволит ввести вручную)
        return new Response(JSON.stringify({
          error: "LLM chat error",
          details: openAiErr || "No providers available (set OPENAI_API_KEY or HF_TOKEN)"
        }), { status: 500, headers: { "Content-Type": "application/json" } });
      }

      try {
        const prompt = `Придумай одну очень короткую народную пословицу. Тема: "${topic}". Стиль: "${style}". Язык: ${lang}. До 12 слов. Без политики и оскорблений. Верни только пословицу.`;

        // Модель можно поменять на любую доступную текстовую инструктивную
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
        const raw = Array.isArray(out) ? (out[0]?.generated_text || "") : (out?.generated_text || out || "");
        proverb = String(raw).split("\n").pop().trim().replace(/^["'«»]+|["'«»]+$/g, "");
      } catch (e) {
        return new Response(JSON.stringify({ error: "HF exception", details: String(e) }), {
          status: 500, headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ===== 3) Возвращаем результат (без image_url — фон делает фронт)
    return new Response(JSON.stringify({ proverb, image_url: null }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
