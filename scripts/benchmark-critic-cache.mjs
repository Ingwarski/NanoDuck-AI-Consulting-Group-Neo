// Explicit opt-in public fixture; never replay private application conversations.
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/server/config.mjs';
import { createClaudeProvider } from '../src/server/claude-provider.mjs';
import { readPromptDefault } from '../src/server/instruction-bootstrap.mjs';
const { values } = parseArgs({ options: { live: { type: 'boolean' }, model: { type: 'string' }, effort: { type: 'string' }, output: { type: 'string' } } });
if (!values.live || !values.model || !values.effort || !values.output) console.log('Usage: node scripts/benchmark-critic-cache.mjs --live --model MODEL --effort EFFORT --output REPORT.json');
else {
  const provider = createClaudeProvider(loadConfig()); const contextScope = `critic-cache-benchmark-${Date.now()}`;
  const runtimeInstructions = await readPromptDefault(); const reports = [];
  const owner = 'Synthetic evidence review. Every record below is fictional. Identify missing evidence, not business advice.\n' + Array.from({length:120},(_,i)=>`Record ${i+1}: A fictional team proposes a pilot. Revenue projections are estimates, not observed sales. The proposal has no measured retention data. A pilot should record demand, costs and retention before expansion.`).join('\n');
  try {
    for (let round = 1; round <= 2; round++) {
      const attempts = []; const start = Date.now();
      const result = await provider.invoke({ model: values.model, effort: values.effort, contextScope, runtimeInstructions, research:false, outputKind:'team_review', evidence:{owner, discussion:''}, assignment:`Review round ${round}. Reply in one short sentence identifying one material evidence gap.`, onUsage: attempt => { if (attempt.status !== 'running') { const {id,...safe}=attempt;attempts.push(safe); } } });
      reports.push({round,ok:result.ok,code:result.code,elapsedMs:Date.now()-start,attempts});
    }
  } finally { await provider.releaseScope(contextScope); }
  await writeFile(values.output,JSON.stringify({model:values.model,effort:values.effort,method:'Two consecutive different assignments with identical synthetic owner context and stable isolated workspace. No guarantee for other durations, cache routing or private workloads.',reports},null,2)+'\n',{mode:0o600});
  console.log('Critic cache comparison saved.');
}
