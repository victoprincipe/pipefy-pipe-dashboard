import type {
  FieldKind,
  NormalizedCard,
  PipeFieldMeta,
  PipeSchema,
} from '../types/pipefy';
import { parseFlexibleDate, parseFlexibleNumber } from '../utils/xlsxNormalizer';

export const ME_QUERY = `
  query Me {
    me {
      id
      name
      email
      username
    }
  }
`;

export const PIPE_META_QUERY = `
  query PipeMeta($pipeId: ID!) {
    pipe(id: $pipeId) {
      id
      suid
      uuid
      name
      cards_count
      opened_cards_count
      role
      labels {
        id
        name
        color
      }
      phases {
        id
        name
        done
        cards_count
        fields {
          id
          label
          type
          options
        }
      }
      start_form_fields {
        id
        label
        type
        options
      }
      reports {
        id
        name
      }
    }
  }
`;

export const PIPE_REPORT_COLUMNS_QUERY = `
  query PipeReportColumns($pipeUuid: String!) {
    pipeReportColumns(pipeUuid: $pipeUuid) {
      name
      label
      type
    }
  }
`;

export const CREATE_PIPE_REPORT_MUTATION = `
  mutation CreatePipeReport($input: CreatePipeReportInput!) {
    createPipeReport(input: $input) {
      pipeReport {
        id
        name
        cardCount
      }
    }
  }
`;

export const EXPORT_PIPE_REPORT_MUTATION = `
  mutation ExportPipeReport($input: ExportPipeReportInput!) {
    exportPipeReport(input: $input) {
      pipeReportExport {
        id
        state
      }
    }
  }
`;

export const PIPE_REPORT_EXPORT_QUERY = `
  query PipeReportExport($id: ID!) {
    pipeReportExport(id: $id) {
      id
      fileURL
      state
      startedAt
    }
  }
`;

export const ALL_CARDS_PAGE_QUERY = `
  query AllCardsPage($pipeId: ID!, $first: Int!, $after: String) {
    allCards(pipeId: $pipeId, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          suid
          title
          createdAt
          updated_at
          finished_at
          due_date
          done
          expired
          late
          current_phase {
            id
            name
          }
          assignees {
            name
          }
          labels {
            name
          }
          createdBy {
            name
          }
          fields {
            name
            value
            float_value
            date_value
            field {
              id
              label
              type
            }
          }
        }
      }
    }
  }
`;

export const ALL_CARDS_TAIL_QUERY = `
  query AllCardsTail($pipeId: ID!, $last: Int!) {
    allCards(pipeId: $pipeId, last: $last) {
      edges {
        node {
          id
          suid
          title
          createdAt
          updated_at
          finished_at
          due_date
          done
          expired
          late
          current_phase {
            id
            name
          }
          assignees {
            name
          }
          labels {
            name
          }
          createdBy {
            name
          }
          fields {
            name
            value
            float_value
            date_value
            field {
              id
              label
              type
            }
          }
        }
      }
    }
  }
`;

export const SINGLE_CARD_QUERY = `
  query SingleCard($id: ID!) {
    card(id: $id) {
      id
      suid
      title
      createdAt
      updated_at
      finished_at
      due_date
      done
      expired
      late
      current_phase {
        id
        name
      }
      assignees {
        name
      }
      labels {
        name
      }
      createdBy {
        name
      }
      fields {
        name
        value
        float_value
        date_value
        field {
          id
          label
          type
        }
      }
    }
  }
`;

export function inferFieldKind(pipefyType: string, fieldId?: string): FieldKind {
  const t = (pipefyType || '').toLowerCase();
  const id = (fieldId || '').toLowerCase();
  if (t === 'number' || t === 'currency' || t === 'formula') return 'number';
  if (t === 'date' || t === 'datetime' || t === 'due_date') return 'date';
  if (t === 'checkbox' || t === 'boolean') return 'boolean';
  if (
    t === 'select' ||
    t === 'radio_vertical' ||
    t === 'radio_horizontal' ||
    t === 'assignee_select' ||
    t === 'label_select' ||
    id === 'estado' ||
    id === 'cidade' ||
    id === 'empresa'
  ) {
    return 'category';
  }
  if (t === 'email' || t === 'phone' || t === 'long_text' || t === 'id') return 'text';
  // short_text can be categorical (Empresa, Cidade, Estado) or text (Nome Contato)
  if (t === 'short_text') {
    if (id.includes('nome') || id.includes('name') || id.includes('obs') || id.includes('desc')) {
      return 'text';
    }
    return 'category';
  }
  return 'text';
}

export const BUILT_IN_PIPE_FIELDS: PipeFieldMeta[] = [
  { key: '__phase', label: 'Fase Atual', pipefyType: 'phase', kind: 'category', isBuiltIn: true },
  { key: '__status', label: 'Status (Concluído)', pipefyType: 'status', kind: 'category', isBuiltIn: true },
  { key: '__sla', label: 'Situação SLA', pipefyType: 'sla', kind: 'category', isBuiltIn: true },
  { key: '__createdAt', label: 'Data de Criação', pipefyType: 'date', kind: 'date', isBuiltIn: true },
  { key: '__finishedAt', label: 'Data de Conclusão', pipefyType: 'date', kind: 'date', isBuiltIn: true },
  { key: '__dueDate', label: 'Vencimento (SLA)', pipefyType: 'date', kind: 'date', isBuiltIn: true },
  { key: '__leadTimeHours', label: 'Lead Time (horas)', pipefyType: 'number', kind: 'number', isBuiltIn: true },
  { key: '__createdBy', label: 'Criador', pipefyType: 'user', kind: 'category', isBuiltIn: true },
  { key: '__assignee', label: 'Responsável', pipefyType: 'user', kind: 'category', isBuiltIn: true },
  { key: '__label', label: 'Etiqueta', pipefyType: 'label', kind: 'category', isBuiltIn: true },
];

export function buildPipeSchemaFromGraphQL(
  rawPipe: any,
  reportColumns: Array<{ name: string; label: string; type: string }> = []
): PipeSchema {
  const reportByLabel = new Map<string, string>();
  for (const col of reportColumns) {
    reportByLabel.set(col.label.trim().toLowerCase(), col.name);
  }

  const seenFieldIds = new Set<string>();
  const customFields: PipeFieldMeta[] = [];

  const rawFieldSources = [
    ...(rawPipe?.start_form_fields ?? []),
    ...((rawPipe?.phases ?? []).flatMap((ph: any) => ph.fields ?? [])),
  ];

  for (const f of rawFieldSources) {
    if (!f || !f.id || seenFieldIds.has(f.id)) continue;
    // Skip statement/ID-only synthetic fields if needed, keep useful ones
    if (f.type === 'statement') continue;
    seenFieldIds.add(f.id);

    const kind = inferFieldKind(f.type, f.id);
    const reportCol = reportByLabel.get(String(f.label || '').trim().toLowerCase());
    customFields.push({
      key: f.id,
      label: f.label || f.id,
      pipefyType: f.type,
      kind,
      isBuiltIn: false,
      reportColumnName: reportCol,
      options: Array.isArray(f.options) ? f.options : [],
    });
  }

  return {
    id: String(rawPipe.id),
    suid: rawPipe.suid,
    uuid: rawPipe.uuid,
    name: rawPipe.name || `Pipe ${rawPipe.id}`,
    cardsCount: Number(rawPipe.cards_count ?? 0),
    openedCardsCount: Number(rawPipe.opened_cards_count ?? 0),
    role: rawPipe.role ?? null,
    phases: (rawPipe.phases ?? []).map((p: any) => ({
      id: String(p.id),
      name: p.name,
      done: Boolean(p.done),
      cardsCount: Number(p.cards_count ?? 0),
    })),
    labels: (rawPipe.labels ?? []).map((l: any) => ({
      id: String(l.id),
      name: l.name,
      color: l.color || '#64748B',
    })),
    reports: (rawPipe.reports ?? []).map((r: any) => ({
      id: String(r.id),
      name: r.name,
    })),
    fields: [...customFields, ...BUILT_IN_PIPE_FIELDS],
  };
}

export function normalizeGraphQLCard(node: any, schema: PipeSchema): NormalizedCard {
  const fieldMetaMap = new Map<string, PipeFieldMeta>();
  for (const f of schema.fields) {
    if (!f.isBuiltIn) fieldMetaMap.set(f.key, f);
  }

  const fields: Record<string, string | number | boolean | null> = {};
  for (const fv of node.fields ?? []) {
    const fId = fv?.field?.id;
    if (!fId) continue;
    const meta = fieldMetaMap.get(fId);
    const kind = meta?.kind ?? inferFieldKind(fv?.field?.type ?? '', fId);

    if (kind === 'number') {
      fields[fId] =
        typeof fv.float_value === 'number'
          ? fv.float_value
          : parseFlexibleNumber(fv.value);
    } else if (kind === 'date') {
      fields[fId] = fv.date_value || parseFlexibleDate(fv.value).iso;
    } else if (kind === 'boolean') {
      const s = String(fv.value ?? '').trim().toLowerCase();
      fields[fId] = s === 'true' || s === 'sim' || s === 'yes' || s === '1';
    } else {
      fields[fId] = fv.value !== undefined && fv.value !== null ? String(fv.value).trim() : null;
    }
  }

  const created = parseFlexibleDate(node.createdAt);
  const finished = parseFlexibleDate(node.finished_at);
  const due = parseFlexibleDate(node.due_date);

  let leadTimeHours: number | null = null;
  if (created.ms !== null && finished.ms !== null && finished.ms >= created.ms) {
    leadTimeHours = Math.round(((finished.ms - created.ms) / 3_600_000) * 100) / 100;
  }

  const assignees = (node.assignees ?? []).map((a: any) => a?.name).filter(Boolean);
  const labels = (node.labels ?? []).map((l: any) => l?.name).filter(Boolean);
  const phaseName = node.current_phase?.name || 'Sem fase';

  const searchParts = [
    String(node.id),
    String(node.title ?? ''),
    phaseName,
    ...assignees,
    ...labels,
    ...Object.values(fields).filter((v) => v !== null && v !== undefined).map(String),
  ];

  return {
    id: String(node.id),
    suid: node.suid,
    title: String(node.title ?? node.id),
    phaseId: String(node.current_phase?.id ?? ''),
    phaseName,
    done: Boolean(node.done),
    late: Boolean(node.late),
    expired: Boolean(node.expired),
    createdAt: created.iso,
    createdAtMs: created.ms,
    updatedAt: parseFlexibleDate(node.updated_at).iso,
    finishedAt: finished.iso,
    dueDate: due.iso,
    dueDateMs: due.ms,
    assignees,
    labels,
    createdBy: node.createdBy?.name || '',
    leadTimeHours,
    fields,
    searchText: searchParts.join(' ').toLowerCase(),
  };
}
