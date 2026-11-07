/**
 * AI Integration Architecture - Master Configuration
 * Centralizes model selection, limits, and rules for the Universal Scheduling Engine.
 */

import { openAIModelName } from './openai-model';

export const AI_CONFIG = {
  // Model Configurations: default to the app-wide OpenAI model (gpt-6-luna unless OPENAI_MODEL /
  // OPENAI_UPLOAD_MODEL say otherwise). AI_*_MODEL still override a single role when set.
  models: {
    primaryPlanning: process.env.AI_PRIMARY_MODEL || openAIModelName(),
    secondaryClassification: process.env.AI_SECONDARY_MODEL || openAIModelName(),
    fallback: process.env.AI_FALLBACK_MODEL || openAIModelName(),
  },
  
  // Execution Limits
  limits: {
    maxOutputTokens: 8192,
    timeoutMs: 120000,
    maxRetries: 2,
    reasoningEffort: 'high',
  },

  // Versioning and Traceability (For Audit Logs)
  versions: {
    promptVersion: 'v2.0.0', // Multi-stage pipeline prompt
    jsonSchemaVersion: 'v2.0.0',
    schedulingRulesVersion: 'v2.1.0'
  }
};
