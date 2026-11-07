import OpenAI from 'openai';
import { openAIModelName } from '@/lib/ai/openai-model';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not defined in environment variables. AI Knowledge Center will be disabled.");
}

export const openaiAdmin = new OpenAI({
  apiKey: apiKey || 'dummy-key-to-prevent-crash', 
});

export const KNOWLEDGE_CENTER_ASSISTANT_NAME = "OneSystemsERP Master Assistant";

let cachedAssistantId: string | null = null;

export async function getOrCreateAssistant() {
  if (!apiKey) return null;

  if (cachedAssistantId) {
    try {
      return await openaiAdmin.beta.assistants.retrieve(cachedAssistantId);
    } catch (e) {
      cachedAssistantId = null; // Reset if deleted
    }
  }

  try {
    const assistants = await openaiAdmin.beta.assistants.list({ limit: 100 });
    let assistant = assistants.data.find(a => a.name === KNOWLEDGE_CENTER_ASSISTANT_NAME);

    if (!assistant) {
      assistant = await openaiAdmin.beta.assistants.create({
        name: KNOWLEDGE_CENTER_ASSISTANT_NAME,
        instructions: "You are the official ERP Assistant for OneSystems ERP. Answer questions based on your vector store and the context provided to you. Never invent ERP policies.",
        // App-wide OpenAI model (gpt-6-luna by default). Only used when the assistant is first created;
        // an existing assistant (found by name above) keeps the model it was created with.
        model: openAIModelName(),
        tools: [{ type: "file_search" }],
      });
    }

    cachedAssistantId = assistant.id;
    return assistant;
  } catch (error) {
    console.error("Error fetching or creating OpenAI Assistant:", error);
    return null;
  }
}
