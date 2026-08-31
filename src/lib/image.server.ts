// Server-only: generate an illustration for an article through the Lovable AI gateway.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function generateArticleImage(prompt: string): Promise<{ dataUrl: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY가 설정되지 않았습니다.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: `블로그 글에 넣을 가로형 대표 이미지를 만들어 주세요. 사진처럼 자연스럽고 글자는 넣지 마세요. 주제: ${prompt}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("이미지 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.");
    if (res.status === 402) throw new Error("AI 크레딧이 부족합니다.");
    throw new Error(`이미지 생성 실패 [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("이미지를 생성하지 못했습니다.");
  return { dataUrl: url };
}
