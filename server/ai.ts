import { invokeLLM, listLLMModels } from "./_core/llm";

export type DramaInput = {
  title: string;
  logline: string;
  genre: string;
  tone: string;
  episodeCount: number;
};

export type DramaOutput = {
  title: string;
  logline: string;
  hook: string;
  characters: Array<{ name: string; role: string; desire: string; conflict: string }>;
  episodes: Array<{
    number: number;
    title: string;
    summary: string;
    cliffhanger: string;
    scenes: Array<{ location: string; time: string; beat: string; dialogue: string }>;
  }>;
  productionNotes: string[];
};

const outputSchema = {
  name: "short_drama_package",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      logline: { type: "string" },
      hook: { type: "string" },
      characters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            desire: { type: "string" },
            conflict: { type: "string" },
          },
          required: ["name", "role", "desire", "conflict"],
        },
      },
      episodes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            number: { type: "integer" },
            title: { type: "string" },
            summary: { type: "string" },
            cliffhanger: { type: "string" },
            scenes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  location: { type: "string" },
                  time: { type: "string" },
                  beat: { type: "string" },
                  dialogue: { type: "string" },
                },
                required: ["location", "time", "beat", "dialogue"],
              },
            },
          },
          required: ["number", "title", "summary", "cliffhanger", "scenes"],
        },
      },
      productionNotes: { type: "array", items: { type: "string" } },
    },
    required: ["title", "logline", "hook", "characters", "episodes", "productionNotes"],
  },
};

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : (part as { text?: string }).text ?? "").join("\n");
  return "";
}

function parseJson(text: string): DramaOutput {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI returned no JSON object");
  const value = JSON.parse(cleaned.slice(start, end + 1)) as DramaOutput;
  if (!value.title || !Array.isArray(value.episodes) || !Array.isArray(value.characters)) {
    throw new Error("AI response did not match the drama package shape");
  }
  return value;
}

export async function generateShortDrama(input: DramaInput) {
  const models = await listLLMModels();
  const model = models.data.find(candidate => /gpt|gemini|claude/i.test(candidate.id))?.id ?? models.data[0]?.id;
  if (!model) throw new Error("No LLM model is available for this project");

  const prompt = `请为短剧创作者生成一份可以继续拍摄的短剧方案。\n\n项目标题：${input.title}\n一句话设定：${input.logline}\n类型：${input.genre}\n基调：${input.tone}\n集数：${input.episodeCount}\n\n要求：用中文输出；先抓住前3秒钩子；人物动机要能驱动冲突；每集给出可执行的场景和一句关键对白；每集结尾留下明确悬念；控制场景数量，适合短剧低成本拍摄。严格返回约定的 JSON 结构，不要 Markdown。`;
  const messages = [
    { role: "system" as const, content: "你是资深短剧编剧与现场统筹，擅长把创意压缩成可拍摄、可连载的分镜化方案。" },
    { role: "user" as const, content: prompt },
  ];

  let result;
  try {
    result = await invokeLLM({ model, messages, responseFormat: { type: "json_schema", json_schema: outputSchema }, maxTokens: 5000 });
  } catch (error) {
    console.warn("[AI] Structured request failed, retrying without schema", error);
    result = await invokeLLM({ model, messages, maxTokens: 5000 });
  }
  const text = contentToText(result.choices?.[0]?.message?.content);
  if (!text) throw new Error("AI returned an empty response");
  return { output: parseJson(text), model: result.model || model, totalTokens: result.usage?.total_tokens ?? 0 };
}
