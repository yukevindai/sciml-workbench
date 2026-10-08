import { parseResearchTool } from './decode';
import type { ResearchTool, MarketTool } from './generated/http';

export type ToolDraft = Pick<ResearchTool, 'name' | 'description' | 'instructions' | 'capabilities'>;

/** Model output is an editable suggestion, never executable code or a saved tool. */
export function readToolDraft(answer: string, capabilities: MarketTool[]): ToolDraft {
  const value: unknown = JSON.parse(answer);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['name','description','instructions','capabilities'].includes(key))) {
    throw new Error('The agent did not return a usable tool draft. Try a more specific description or build it manually.');
  }
  const tool = parseResearchTool({ ...value, id: 'draft', revision: 1, archived: false });
  if (!tool.name.trim() || !tool.instructions.trim() || !tool.capabilities.length
    || new Set(tool.capabilities).size !== tool.capabilities.length
    || tool.capabilities.some(id => !capabilities.some(item => item.id === id))) {
    throw new Error('The draft includes unavailable capabilities or incomplete instructions. Refine your description and try again.');
  }
  return { name: tool.name, description: tool.description, instructions: tool.instructions, capabilities: tool.capabilities };
}

export const SAMPLE_TOOL_DRAFT: ToolDraft = {
  name: 'Paper comparison',
  description: 'Compare experimental conditions and reported findings from supplied papers.',
  instructions: 'Use the supplied paper evidence to compare experimental conditions, measurements and reported outcomes. Cite the exact supporting passages. Return a comparison table, then list missing information and limitations. Do not invent measurements or treat different test conditions as directly comparable.',
  capabilities: ['inspect_project', 'ingest_evidence', 'read_evidence_span'],
};
