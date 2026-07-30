/** AI provider factory. Chooses OpenAI when configured, otherwise the template provider. */
import {
  OpenAiDescriptionProvider,
  TemplateDescriptionProvider,
  type DescriptionProvider,
} from '@okauto/shared';
import { env } from './env';

export function resolveDescriptionProvider(): DescriptionProvider {
  if (env.aiProvider === 'openai' && env.openaiApiKey) {
    return new OpenAiDescriptionProvider(env.openaiApiKey, env.openaiModel);
  }
  return new TemplateDescriptionProvider();
}
