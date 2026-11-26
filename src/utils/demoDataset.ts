import type { NormalizedCard, PipeSchema } from '../types/pipefy';
import { BUILT_IN_PIPE_FIELDS } from '../sdk/pipefyQueries';

export const DEMO_PIPE_SCHEMA: PipeSchema = {
  id: '307435909',
  suid: '6iKLgQPM',
  uuid: '2bc83683-6756-40f5-a650-76988f129f46',
  name: 'Tech. Consultants (Case 1) · Prévia Standalone',
  cardsCount: 20000,
  openedCardsCount: 0,
  role: 'admin',
  phases: [
    { id: '344746793', name: 'Concluded', done: true, cardsCount: 20000 },
  ],
  labels: [],
  reports: [],
  fields: [
    { key: 'nome_contato', label: 'Nome Contato', pipefyType: 'short_text', kind: 'text', isBuiltIn: false },
    { key: 'email', label: 'Email', pipefyType: 'email', kind: 'text', isBuiltIn: false },
    { key: 'empresa', label: 'Empresa', pipefyType: 'short_text', kind: 'category', isBuiltIn: false },
    { key: 'cidade', label: 'Cidade', pipefyType: 'short_text', kind: 'category', isBuiltIn: false },
    { key: 'estado', label: 'Estado', pipefyType: 'short_text', kind: 'category', isBuiltIn: false },
    { key: 'valor_total', label: 'Valor Total', pipefyType: 'number', kind: 'number', isBuiltIn: false },
    { key: 'data_limite', label: 'Data Limite', pipefyType: 'date', kind: 'date', isBuiltIn: false },
    ...BUILT_IN_PIPE_FIELDS,
  ],
};

const COMPANIES = [
  'Acme Holding',
  'Aperture LTDA',
  'Soylent Corp',
  'Stark Infra',
  'Wayne Tech',
  'Initech Brasil',
  'Hooli Cloud',
  'Cyberdyne SA',
  'Globex Logística',
  'Umbrella Health',
];

const CITIES: Array<{ cidade: string; estado: string }> = [
  { cidade: 'São Paulo', estado: 'SP' },
  { cidade: 'Campinas', estado: 'SP' },
  { cidade: 'Rio de Janeiro', estado: 'RJ' },
  { cidade: 'Curitiba', estado: 'PR' },
  { cidade: 'Porto Alegre', estado: 'RS' },
  { cidade: 'Belo Horizonte', estado: 'MG' },
  { cidade: 'Florianópolis', estado: 'SC' },
  { cidade: 'Salvador', estado: 'BA' },
  { cidade: 'Recife', estado: 'PE' },
  { cidade: 'Brasília', estado: 'DF' },
];

const FIRST_NAMES = ['Ursula', 'Wagner', 'Vitor', 'Beatriz', 'Rafael', 'Camila', 'Lucas', 'Mariana', 'Gabriel', 'Helena'];
const LAST_NAMES = ['Souza', 'Martins', 'Oliveira', 'Silva', 'Pereira', 'Costa', 'Almeida', 'Ferreira', 'Rodrigues', 'Lima'];

/**
 * Deterministic 20,000-card generator matching the exact field structure of Pipe 307435909.
 * Used ONLY when opening the app URL directly outside Pipefy iframe (Standalone Preview mode).
 */
export function generateDemoDataset(count = 20000): {
  cards: NormalizedCard[];
  schema: PipeSchema;
} {
  const cards: NormalizedCard[] = new Array(count);
  const baseCreated = Date.UTC(2026, 10, 13, 18, 44, 0);

  let seed = 421337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i += 1) {
    const id = String(1478388794 + i);
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const nome = `${fn} ${ln}`;
    const empresa = COMPANIES[Math.floor(rand() * COMPANIES.length)];
    const loc = CITIES[Math.floor(rand() * CITIES.length)];
    const valor = Math.round((15000 + Math.pow(rand(), 1.6) * 1450000) * 100) / 100;

    // Spread Data Limite across 12 months in 2027
    const limitMonth = Math.floor(rand() * 12);
    const limitDay = 1 + Math.floor(rand() * 28);
    const dataLimite = `2027-${String(limitMonth + 1).padStart(2, '0')}-${String(limitDay).padStart(2, '0')}`;

    const createdMs = baseCreated + Math.floor((i / count) * 3600 * 1000);
    const createdIso = new Date(createdMs).toISOString();
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${1000 + (i % 9000)}@${empresa.split(' ')[0].toLowerCase()}.com`;

    const fields: Record<string, string | number | boolean | null> = {
      nome_contato: nome,
      email,
      empresa,
      cidade: loc.cidade,
      estado: loc.estado,
      valor_total: valor,
      data_limite: dataLimite,
    };

    cards[i] = {
      id,
      title: id,
      phaseId: '344746793',
      phaseName: 'Concluded',
      done: true,
      late: false,
      expired: false,
      createdAt: createdIso,
      createdAtMs: createdMs,
      updatedAt: createdIso,
      finishedAt: createdIso,
      dueDate: null,
      dueDateMs: null,
      assignees: [],
      labels: [],
      createdBy: 'Marcelo Appezato',
      leadTimeHours: 0,
      fields,
      searchText: `${id} concluded ${nome} ${email} ${empresa} ${loc.cidade} ${loc.estado} ${valor} ${dataLimite}`.toLowerCase(),
    };
  }

  return { cards, schema: DEMO_PIPE_SCHEMA };
}
