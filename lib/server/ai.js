import { pickWeightedByRating } from '@/lib/shuffle';

// "Escolha da IA": pede a um provedor de LLM para escolher um titulo dentro
// do catalogo que o cliente ja carregou (lib/xtream.js) e explicar o motivo.
// Mesma ideia de isolamento de provedor que lib/server/billing.js usa para o
// Stripe - troca de provedor e escrever uma nova funcao `call*`, nada no
// resto do app muda.
//
// Sem AI_PROVIDER/ANTHROPIC_API_KEY/OPENAI_API_KEY o produto continua
// funcionando normalmente: o recurso so fica indisponivel (ver aiConfigured).

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_CANDIDATES = 120;
const REQUEST_TIMEOUT_MS = 20000;

// AI_PROVIDER explicito vence; sem ele, usa a chave presente (Anthropic
// primeiro) - assim o recurso liga sozinho quando so uma das duas esta
// configurada, sem exigir mais uma variavel manual.
export function resolveProvider() {
  const explicit = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai') return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export function aiConfigured() {
  return !!resolveProvider();
}

function trim(value, max) {
  const s = String(value || '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function buildPrompt({ kind, items, favoriteNames, historyNames, theme }) {
  const label = kind === 'series' ? 'series' : 'filmes';
  const catalog = items
    .map((item) => {
      const bits = [`id=${item.id}`, item.name];
      if (item.genre) bits.push(`genero: ${trim(item.genre, 60)}`);
      if (item.rating) bits.push(`nota: ${item.rating}`);
      if (item.plot) bits.push(`sinopse: ${trim(item.plot, 140)}`);
      return `- ${bits.join(' | ')}`;
    })
    .join('\n');

  const favorites = favoriteNames.length ? favoriteNames.join(', ') : 'nenhum';
  const history = historyNames.length ? historyNames.join(', ') : 'nenhum';
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Multitela';
  // The candidate list is already filtered to this theme client-side
  // (page.js), so this line is about tone/reasoning, not correctness.
  const themeLine = theme ? `\nO usuario pediu especificamente algo do tema "${theme}" agora.` : '';

  return `Voce e o sistema de recomendacao do ${appName}, um app de streaming IPTV.
Escolha UM titulo da lista de ${label} abaixo para recomendar ao usuario agora e explique o motivo em 1-2 frases curtas, em portugues do Brasil, de forma cativante e especifica ao titulo escolhido.
Use os favoritos e o historico apenas como pistas de gosto (genero, tom, franquia); prefira algo que o usuario ainda nao tenha assistido.${themeLine}

Favoritos do usuario: ${favorites}
Assistidos recentemente: ${history}

Catalogo disponivel (responda com o id exatamente como esta escrito):
${catalog}`;
}

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY nao configurada');

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      // tool_choice forcado evita parsear texto livre em busca do id.
      tools: [
        {
          name: 'select_pick',
          description: 'Registra a recomendacao escolhida.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'id do titulo escolhido, exatamente como no catalogo' },
              reason: { type: 'string', description: 'motivo curto da escolha, em portugues' },
            },
            required: ['id', 'reason'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'select_pick' },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Falha na comunicacao com a Anthropic (${res.status})`);
  }
  const toolUse = data?.content?.find((block) => block.type === 'tool_use');
  if (!toolUse?.input?.id) throw new Error('Resposta da IA sem um id valido');
  return { id: String(toolUse.input.id), reason: String(toolUse.input.reason || '').trim() };
}

// Modelos "o*" (o1, o3, o4-mini, ...) sao modelos de raciocinio: gastam parte
// do orcamento de tokens "pensando" antes de responder. Sem reasoning_effort
// baixo, uma tarefa simples como esta pode consumir os max_completion_tokens
// inteiros em raciocinio e devolver content vazio (finish_reason "length") -
// foi exatamente o que aconteceu testando com o4-mini. gpt-4o/gpt-4o-mini nao
// e um desses modelos e rejeita o parametro com erro, entao so envia quando
// o nome do modelo bate com o padrao.
const REASONING_MODEL_RE = /^o\d/i;

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY nao configurada');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  const isReasoningModel = REASONING_MODEL_RE.test(model);

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      // max_completion_tokens (nao max_tokens) para funcionar tambem com
      // modelos de raciocinio, que rejeitam o parametro antigo.
      max_completion_tokens: isReasoningModel ? 1000 : 300,
      ...(isReasoningModel ? { reasoning_effort: 'low' } : {}),
      messages: [
        {
          role: 'system',
          content:
            'Responda somente com um objeto JSON no formato {"id": "...", "reason": "..."}, sem texto fora do JSON.',
        },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Falha na comunicacao com a OpenAI (${res.status})`);
  }
  const content = data?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Resposta da IA nao veio em JSON valido');
  }
  if (!parsed?.id) throw new Error('Resposta da IA sem um id valido');
  return { id: String(parsed.id), reason: String(parsed.reason || '').trim() };
}

// Escolhe um titulo do catalogo enviado pelo cliente. So propaga erro quando
// a chamada em si falha (rede/HTTP) - quem chama usa isso para decidir se
// consome o cooldown do usuario. Uma resposta que veio mas aponta para um id
// fora do catalogo (o modelo "alucinou") nao e tratada como falha: cai para
// o sorteio ponderado (lib/shuffle.js) e sinaliza `fallback: true`, para o
// recurso nunca ficar quebrado, so menos inteligente.
export async function pickWithAI({ kind, items, favoriteNames, historyNames, theme }) {
  const provider = resolveProvider();
  if (!provider) throw new Error('Nenhum provedor de IA configurado');
  if (!items || items.length === 0) throw new Error('Catalogo vazio');

  const candidates = items.slice(0, MAX_CANDIDATES);
  const prompt = buildPrompt({
    kind,
    items: candidates,
    favoriteNames: favoriteNames || [],
    historyNames: historyNames || [],
    theme,
  });

  const result = provider === 'anthropic' ? await callAnthropic(prompt) : await callOpenAI(prompt);

  const match = candidates.find((item) => String(item.id) === result.id);
  if (match) return { item: match, reason: result.reason || 'Escolhido especialmente para voce.', fallback: false };

  const fallback = pickWeightedByRating(candidates);
  if (!fallback) throw new Error('Catalogo vazio');
  return {
    item: fallback,
    reason: 'Escolhido para voce a partir do catalogo disponivel.',
    fallback: true,
  };
}
