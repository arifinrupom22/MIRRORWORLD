import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  Bot,
  Check,
  CircleAlert,
  Copy,
  Cpu,
  Database,
  Info,
  ListChecks,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wand2,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import type {
  AIBriefing,
  AIChatResponse,
  AIMode,
  AIProposal,
  AIQualityLabel,
  AIQuickAction,
  AIReasoning,
  AIStatus,
  AIValidation,
} from '../lib/types'
import { toast, useAppStore } from '../store/appStore'
import { Badge, Button, IconButton, Panel, PanelHeader } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { cn, fmtNumber } from '../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  meta?: Partial<AIChatResponse>
  question?: string
  proposal?: AIProposal
  streaming?: boolean
  error?: string
  notice?: string
}

const SEED_QUESTIONS = [
  'Explain the current campus state and the highest-severity alerts.',
  'Which cohorts have the tightest building transitions?',
  'Where are the campus bottlenecks, and what evidence supports that?',
  'What happens if a building becomes unavailable?',
]

const SUGGESTED_BY_PAGE: Record<string, string> = {
  '/campus': 'Explain the campus inventory, facilities and the limits of the dataset.',
  '/simulation': 'Analyse the active scenario and everything that changed against the baseline.',
  '/optimizer': 'Explain the latest optimisation: solver status, objective and trade-offs.',
  '/comparison': 'Compare baseline and scenario, and explain the difference engine rows.',
  '/alerts': 'Which alerts need action first, and what evidence supports their severity?',
}

const MODES: { id: AIMode; label: string; blurb: string; stub: string }[] = [
  { id: 'ask', label: 'Ask', blurb: 'Direct grounded answers', stub: 'Explain the current campus state and the highest-severity alerts.' },
  { id: 'analyst', label: 'Analyst', blurb: 'Investigate bottlenecks and risks', stub: 'Analyse the current campus: bottlenecks, conflicts and risks.' },
  { id: 'what_if', label: 'What-if', blurb: 'Validated proposals, never edits', stub: 'What if building AT became unavailable?' },
  { id: 'advisor', label: 'Advisor', blurb: 'Benefits, risks and trade-offs', stub: 'What should we improve first, and what does each change cost us?' },
  { id: 'research', label: 'Research', blurb: 'How twins and CP-SAT work', stub: 'How does a campus digital twin work, and how does CP-SAT help here?' },
]

const MODE_KEY = 'mirrorworld.ai.mode'

function loadMode(): AIMode {
  try {
    const stored = window.localStorage.getItem(MODE_KEY)
    return MODES.some((entry) => entry.id === stored) ? (stored as AIMode) : 'ask'
  } catch {
    return 'ask'
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

function historyKey(scenarioId: string | null) {
  return `mirrorworld.ai.history.${scenarioId ?? 'baseline'}`
}

function loadHistory(scenarioId: string | null): Message[] {
  try {
    const raw = window.localStorage.getItem(historyKey(scenarioId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as Message[]
    return Array.isArray(parsed) ? parsed.slice(-40).map((item) => ({ ...item, streaming: false })) : []
  } catch {
    return []
  }
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'number') return fmtNumber(value, Number.isInteger(value) ? 0 : 2)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function MetaBadges({ meta }: { meta: Partial<AIChatResponse> }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-lineSoft pt-2">
      <Badge tone={meta.used_model ? 'success' : 'violet'}>
        {meta.used_model ? `${meta.provider} · ${meta.model}` : 'deterministic rule engine'}
      </Badge>
      {meta.used_model && <Badge tone="info">interpretation by model</Badge>}
      {!meta.used_model && <Badge tone="neutral">numbers from backend services</Badge>}
      {meta.fallback_used && <Badge tone="warning">fallback path</Badge>}
      {meta.truncated && <Badge tone="warning">stream truncated</Badge>}
      {meta.provider_error && (
        <span className="flex w-full items-start gap-1 font-mono text-[8.5px] leading-relaxed text-warning/90">
          <CircleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          {meta.provider_error.slice(0, 180)}
        </span>
      )}
      {meta.provider_error_hint && (
        <span className="text-[9.5px] leading-relaxed text-faint">{meta.provider_error_hint}</span>
      )}
      {!!meta.tools?.length && (
        <span className="flex w-full flex-wrap items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.04em] text-faint">
          <Cpu className="h-2.5 w-2.5" /> tools ·{' '}
          {meta.tools.map((tool) => `${tool.tool}${tool.ok ? '' : ' (failed)'}`).join(' · ')}
        </span>
      )}
    </div>
  )
}

function ReasoningPanel({ reasoning, quality }: { reasoning: AIReasoning; quality: AIQualityLabel[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 rounded border border-lineSoft bg-subtle/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">
          {reasoning.mode_label} · evidence, assumptions and limits
        </span>
        <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.04em] text-faint">
          {reasoning.text_origin === 'language-model' ? 'model narration' : 'no model used'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-lineSoft px-2.5 py-2">
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">Evidence quality</div>
            <ul className="mt-1 space-y-1">
              {quality.map((row) => (
                <li key={row.key} className="text-[10px] leading-relaxed text-muted">
                  <span className="font-medium text-ink">{row.label}</span> — {row.scope}
                </li>
              ))}
            </ul>
          </div>
          {reasoning.sources.length > 0 && (
            <div>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">Data sources</div>
              <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-muted">{reasoning.sources.join(' · ')}</p>
            </div>
          )}
          {reasoning.assumptions.length > 0 && (
            <div>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">Assumptions in force</div>
              <ul className="mt-1 space-y-1">
                {reasoning.assumptions.slice(0, 4).map((row) => (
                  <li key={`${row.claim}-${row.status}`} className="text-[10px] leading-relaxed text-muted">
                    {row.claim} — <span className="text-ink">{row.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reasoning.limitations.length > 0 && (
            <div>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">Limitations</div>
              <ul className="mt-1 space-y-1">
                {reasoning.limitations.map((item) => (
                  <li key={item} className="text-[10px] leading-relaxed text-warning/90">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reasoning.next_actions.length > 0 && (
            <div>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">Suggested next</div>
              <ul className="mt-1 space-y-1">
                {reasoning.next_actions.map((action, index) => (
                  <li key={`${action.label ?? 'next'}-${index}`} className="text-[10px] leading-relaxed text-muted">
                    {action.route ? (
                      <Link to={action.route} className="text-cyan hover:underline">
                        {action.label}
                      </Link>
                    ) : (
                      action.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EvidenceGrid({ evidence }: { evidence: NonNullable<AIChatResponse['evidence']> }) {
  if (!evidence.length) return null
  return (
    <div className="mt-2 grid gap-px overflow-hidden rounded border border-lineSoft bg-lineSoft sm:grid-cols-2">
      {evidence.slice(0, 8).map((item) => (
        <div key={item.label} className="bg-panel px-2.5 py-1.5">
          <div className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">{item.label}</div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[11px] tabular-nums text-ink">
              {typeof item.value === 'number'
                ? fmtNumber(item.value, Number.isInteger(item.value) ? 0 : 2)
                : item.value ?? '—'}
            </span>
            <span className="truncate font-mono text-[8px] text-faint">{item.source}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProposalCard({
  proposal,
  onApply,
  applying,
}: {
  proposal: AIProposal
  onApply: () => void
  applying: boolean
}) {
  const understood = proposal.understood && proposal.proposal_id && !proposal.applied
  return (
    <div className="mt-2 rounded-lg border border-cyan/25 bg-cyan/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan/20 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
          <Wand2 className="h-3.5 w-3.5 text-cyan" />
          {proposal.name ?? 'Proposed scenario'}
        </span>
        <Badge tone={proposal.blockers.length ? 'critical' : proposal.understood ? 'info' : 'warning'}>
          {proposal.blockers.length
            ? 'blocked by validation'
            : proposal.understood
              ? `validated · ${proposal.parser}`
              : 'needs detail'}
        </Badge>
      </div>

      <div className="space-y-2.5 px-3 py-2.5">
        {proposal.changes.length > 0 && (
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr>
                <th className="border-b border-lineSoft pb-1 text-left font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">
                  Parameter
                </th>
                <th className="border-b border-lineSoft pb-1 text-left font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">
                  Current
                </th>
                <th className="border-b border-lineSoft pb-1 text-left font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">
                  Proposed
                </th>
              </tr>
            </thead>
            <tbody>
              {proposal.changes.map((change) => (
                <tr key={change.label}>
                  <td className="border-b border-lineSoft/60 py-1 pr-2 text-muted">{change.label}</td>
                  <td className="border-b border-lineSoft/60 py-1 pr-2 font-mono text-faint">{renderValue(change.before)}</td>
                  <td className="border-b border-lineSoft/60 py-1 font-mono text-ink">{renderValue(change.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {proposal.questions.length > 0 && (
          <ul className="space-y-1 text-[10.5px] leading-relaxed text-muted">
            {proposal.questions.map((question) => (
              <li key={question} className="flex gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                {question}
              </li>
            ))}
          </ul>
        )}

        {proposal.warnings.map((warning) => (
          <p key={warning} className="flex gap-1.5 text-[10.5px] leading-relaxed text-warning/90">
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {warning}
          </p>
        ))}
        {proposal.blockers.map((blocker) => (
          <p key={blocker} className="flex gap-1.5 text-[10.5px] leading-relaxed text-critical">
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {blocker}
          </p>
        ))}

        <div className="flex flex-wrap items-center gap-2 border-t border-lineSoft pt-2">
          {proposal.applied ? (
            <Badge tone="success" dot>
              scenario created
            </Badge>
          ) : (
            <>
              <Button
                size="xs"
                variant="primary"
                disabled={!understood || applying}
                loading={applying}
                iconLeft={<Check className="h-3 w-3" />}
                onClick={onApply}
              >
                Confirm &amp; create scenario
              </Button>
              <span className="text-[9.5px] leading-relaxed text-faint">
                Nothing is saved until you confirm. Existing scenarios are never modified.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function MirrorAIPage() {
  const activeScenarioId = useAppStore((state) => state.activeScenarioId)
  const activeScenarioName = useAppStore((state) => state.activeScenarioName)
  const setActiveScenario = useAppStore((state) => state.setActiveScenario)

  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [validation, setValidation] = useState<AIValidation | null>(null)
  const [validating, setValidating] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => loadHistory(activeScenarioId))
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [pendingKind, setPendingKind] = useState<'ask' | 'proposal' | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [quickActions, setQuickActions] = useState<AIQuickAction[]>([])
  const [mode, setMode] = useState<AIMode>(loadMode)
  const [briefing, setBriefing] = useState<AIBriefing | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const autoAsked = useRef(false)

  const loadStatus = useCallback(() => {
    setStatusError(null)
    api
      .aiStatus()
      .then((payload) => setStatus(payload.ai))
      .catch((error: unknown) => {
        setStatusError(error instanceof Error ? error.message : 'Mirror AI status could not be read.')
      })
  }, [])

  useEffect(loadStatus, [loadStatus])

  const loadBriefing = useCallback(() => {
    setBriefingLoading(true)
    setBriefingError(null)
    api
      .aiBriefing(activeScenarioId)
      .then((payload) => setBriefing(payload.briefing))
      .catch((error: unknown) => {
        setBriefingError(error instanceof Error ? error.message : 'The briefing could not be composed.')
      })
      .finally(() => setBriefingLoading(false))
  }, [activeScenarioId])

  useEffect(loadBriefing, [loadBriefing])

  useEffect(() => {
    try {
      window.localStorage.setItem(MODE_KEY, mode)
    } catch {
      // A blocked storage API must not stop the mode from working this session.
    }
  }, [mode])

  useEffect(() => {
    setMessages(loadHistory(activeScenarioId))
    autoAsked.current = false
  }, [activeScenarioId])

  useEffect(() => {
    if (!messages.length) return
    try {
      window.localStorage.setItem(historyKey(activeScenarioId), JSON.stringify(messages.slice(-40)))
    } catch {
      // Storage can be full or blocked; the conversation still works in memory.
    }
  }, [messages, activeScenarioId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  const updateMessage = useCallback((id: string, patch: (message: Message) => Message) => {
    setMessages((current) => current.map((message) => (message.id === id ? patch(message) : message)))
  }, [])

  const ask = useCallback(
    async (question: string, options: { regenerate?: boolean } = {}) => {
      const text = question.trim()
      if (!text || pending) return
      setRequestError(null)
      setPending(true)
      setPendingKind('ask')

      const prior = options.regenerate ? messages.filter((message) => message.role !== 'system') : messages
      const history = prior
        .slice(-6)
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }))

      const assistantId = newId()
      setMessages((current) => {
        const base = options.regenerate
          ? current.filter((message, index) => !(index === current.length - 1 && message.role === 'assistant'))
          : [...current, { id: newId(), role: 'user' as const, content: text, question: text }]
        return [...base, { id: assistantId, role: 'assistant', content: '', streaming: true, question: text }]
      })
      setInput('')

      try {
        const done = await api.aiChatStream(
          { message: text, scenario_id: activeScenarioId, history, mode },
          { onDelta: (chunk) => updateMessage(assistantId, (message) => ({ ...message, content: message.content + chunk })) },
        )
        updateMessage(assistantId, (message) => ({
          ...message,
          streaming: false,
          meta: done,
          proposal: done.proposal ?? message.proposal,
          content: done.answer || message.content,
        }))
        if (done.quick_actions) setQuickActions(done.quick_actions)
      } catch (streamError) {
        try {
          const fallback = await api.aiChat({ message: text, scenario_id: activeScenarioId, history, mode })
          updateMessage(assistantId, (message) => ({
            ...message,
            streaming: false,
            meta: fallback,
            content: fallback.answer,
            notice: 'Streaming was unavailable, so this answer was requested in one piece.',
          }))
          if (fallback.quick_actions) setQuickActions(fallback.quick_actions)
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : streamError instanceof Error
                ? streamError.message
                : 'Mirror AI could not answer that question.'
          updateMessage(assistantId, (message) => ({ ...message, streaming: false, error: detail }))
          setRequestError(detail)
        }
      } finally {
        setPending(false)
        setPendingKind(null)
      }
    },
    [activeScenarioId, messages, mode, pending, updateMessage],
  )

  useEffect(() => {
    const seed = searchParams.get('q')
    if (seed && !autoAsked.current) {
      autoAsked.current = true
      void ask(seed)
    }
  }, [ask, searchParams])

  const draftProposal = useCallback(
    async (question: string) => {
      const text = question.trim()
      if (!text || pending) return
      setRequestError(null)
      setPending(true)
      setPendingKind('proposal')
      setMessages((current) => [...current, { id: newId(), role: 'user', content: text }])
      setInput('')
      try {
        const { proposal } = await api.aiProposal({ message: text, scenario_id: activeScenarioId })
        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: 'system',
            content: proposal.understood
              ? 'Validated proposal — review the parameter changes, then confirm.'
              : 'This request needs more detail before it can become a scenario.',
            proposal,
          },
        ])
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'The scenario proposal could not be built.'
        setRequestError(detail)
        setMessages((current) => [...current, { id: newId(), role: 'system', content: '', error: detail }])
      } finally {
        setPending(false)
        setPendingKind(null)
      }
    },
    [activeScenarioId, pending],
  )

  const applyProposal = useCallback(
    async (messageId: string, proposal: AIProposal) => {
      if (!proposal.proposal_id || applyingId) return
      setApplyingId(proposal.proposal_id)
      try {
        const result = await api.aiApplyProposal(proposal.proposal_id)
        setActiveScenario(result.scenario.id, result.scenario.name)
        updateMessage(messageId, (message) => ({
          ...message,
          proposal: message.proposal ? { ...message.proposal, applied: true } : message.proposal,
        }))
        setMessages((current) => [
          ...current,
          {
            id: newId(),
            role: 'system',
            content: `Scenario “${result.scenario.name}” was created with your confirmation and is now active. Its audit entry records the confirmed proposal.`,
          },
        ])
        toast('Scenario created', 'success', result.scenario.name)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'The scenario could not be created.'
        setRequestError(detail)
        toast('Proposal not applied', 'error', detail)
      } finally {
        setApplyingId(null)
      }
    },
    [applyingId, setActiveScenario, updateMessage],
  )

  const copyLast = async () => {
    const last = [...messages].reverse().find((message) => message.role === 'assistant' && message.content)
    if (!last) return
    try {
      await navigator.clipboard.writeText(last.content)
      toast('Answer copied', 'success')
    } catch {
      toast('Clipboard unavailable', 'error', 'Select the answer text and copy it manually.')
    }
  }

  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant' && message.meta)
  const evidence = lastAssistant?.meta?.evidence ?? []
  const disabled = status !== null && !status.enabled

  const pageSeed = SUGGESTED_BY_PAGE[window.location.pathname]
  const suggestions = (
    quickActions.length
      ? quickActions.map((action) => ({ label: action.label, question: action.question, available: action.available, reason: action.reason }))
      : SEED_QUESTIONS.map((question) => ({ label: question, question, available: true, reason: null }))
  ).slice(0, 7)

  return (
    <div>
      <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="telemetry text-cyan/80">Mirror AI · intelligent campus decision copilot</span>
            {status ? (
              <Badge tone={status.mode === 'language-model' ? 'success' : status.enabled ? 'violet' : 'warning'} dot>
                {status.mode === 'language-model'
                  ? `${status.provider} · ${status.model}`
                  : status.enabled
                    ? 'deterministic · no model key'
                    : 'disabled by AI_ENABLED'}
              </Badge>
            ) : (
              <Badge tone="neutral">checking provider</Badge>
            )}
            {activeScenarioName && <Badge tone="info">scenario · {activeScenarioName}</Badge>}
          </div>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">Mirror AI</h1>
          <p className="mt-1 text-[12px] text-cyan/70">Understand. Simulate. Optimize. Decide.</p>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Ask about the campus model, a disruption, a solver result or student movement. Every number is read from
            MIRRORWORLD&apos;s own deterministic services; the copilot explains them and never invents them. Scenario
            changes are drafted as proposals and only become real after you confirm them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/simulation"
            className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line bg-subtle px-3 text-[11.5px] text-ink hover:border-lineHover"
          >
            <Bot className="h-3.5 w-3.5" /> Simulation studio
          </Link>
          <Link
            to="/method"
            className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-line bg-subtle px-3 text-[11.5px] text-muted hover:border-lineHover hover:text-ink"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Method &amp; evidence
          </Link>
        </div>
      </header>

      {statusError && (
        <Panel className="mb-5 border-critical/30 bg-critical/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11.5px] text-critical">
              <CircleAlert className="h-3.5 w-3.5" /> {statusError}
            </p>
            <Button size="xs" variant="ghost" iconLeft={<RefreshCw className="h-3 w-3" />} onClick={loadStatus}>
              Retry
            </Button>
          </div>
        </Panel>
      )}

      {disabled && (
        <Panel className="mb-5 p-4">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-[12px] font-medium text-ink">Mirror AI is disabled</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                <code className="font-mono text-[10.5px]">AI_ENABLED=false</code> turns the copilot off. Set it to
                <code className="mx-1 font-mono text-[10.5px]">true</code> and restart the API. The rest of MIRRORWORLD
                does not depend on it.
              </p>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className={cn('flex min-w-0 flex-col', disabled && 'opacity-60')}>
          <PanelHeader
            eyebrow="Conversation"
            title="Ask MIRRORWORLD"
            subtitle={
              status?.mode === 'language-model'
                ? `${status.provider} · ${status.model} writes the interpretation from a grounded context${status.fallback_model ? `, with ${status.fallback_model} as fallback` : ''}.`
                : 'No model key is configured, so answers come from the deterministic rule engine. They are still grounded in the campus data.'
            }
            action={
              <div className="flex items-center gap-1">
                <IconButton label="Copy last answer" size="sm" variant="ghost" onClick={copyLast} disabled={!lastAssistant}>
                  <Copy className="h-3 w-3" />
                </IconButton>
                <IconButton
                  label="Regenerate last answer"
                  size="sm"
                  variant="ghost"
                  disabled={!lastUser || pending}
                  onClick={() => lastUser && void ask(lastUser.question ?? lastUser.content, { regenerate: true })}
                >
                  <RefreshCw className="h-3 w-3" />
                </IconButton>
                <IconButton
                  label="Clear conversation"
                  size="sm"
                  variant="ghost"
                  disabled={!messages.length || pending}
                  onClick={() => {
                    setMessages([])
                    window.localStorage.removeItem(historyKey(activeScenarioId))
                    toast('Conversation cleared', 'info')
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
            }
          />

          <div className="flex flex-wrap items-center gap-1 border-b border-lineSoft bg-subtle/60 px-3 py-2">
            {MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setMode(entry.id)}
                disabled={disabled}
                title={`${entry.blurb} — ${entry.stub}`}
                aria-pressed={mode === entry.id}
                className={cn(
                  'focus-ring rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.05em] transition-colors disabled:opacity-40',
                  mode === entry.id
                    ? 'border-cyan/45 bg-cyan/10 text-cyan'
                    : 'border-line bg-panel text-faint hover:border-lineHover hover:text-ink',
                )}
              >
                {entry.label}
              </button>
            ))}
            <span className="ml-auto hidden font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint sm:block">
              {MODES.find((entry) => entry.id === mode)?.blurb}
            </span>
          </div>

          <div className="min-h-[360px] flex-1 space-y-3.5 overflow-y-auto px-4 py-4 scroll-thin">
            {messages.length === 0 && !pending && (
              <div className="rounded-lg border border-lineSoft bg-subtle px-4 py-5">
                <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                  <Sparkles className="h-3.5 w-3.5 text-cyan" /> Start with a grounded question
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  Mirror AI reads the campus inventory, baseline diagnostics, alerts, recommendations, the difference
                  engine, the movement engine and any stored plans before answering.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.question}
                      type="button"
                      disabled={!suggestion.available || !status?.enabled}
                      onClick={() => void ask(suggestion.question)}
                      className="focus-ring rounded border border-line bg-panel px-2.5 py-2 text-left text-[11px] leading-snug text-muted transition-colors hover:border-lineHover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      title={suggestion.reason ?? suggestion.question}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
                  <Wand2 className="mt-0.5 h-3 w-3 shrink-0" />
                  To draft a scenario, type a request such as “close {activeScenarioName ? 'a building' : 'Ada Lovelace Block'}”
                  and press <span className="font-mono">Draft scenario</span>.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex gap-2.5', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {message.role !== 'user' && (
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border',
                      message.role === 'system'
                        ? 'border-violet/30 bg-violet/[0.08] text-violet'
                        : 'border-cyan/30 bg-cyan/[0.08] text-cyan',
                    )}
                  >
                    {message.role === 'system' ? <Wand2 className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                  </span>
                )}
                <div
                  className={cn(
                    'min-w-0 max-w-[94%] rounded-lg border px-3 py-2.5',
                    message.role === 'user'
                      ? 'border-line bg-subtle text-ink'
                      : message.error
                        ? 'border-critical/30 bg-critical/[0.04] text-critical'
                        : message.role === 'system'
                          ? 'border-violet/25 bg-violet/[0.04] text-muted'
                          : 'border-lineSoft bg-panel text-muted',
                  )}
                >
                  {message.role === 'user' ? (
                    <div className="whitespace-pre-wrap text-[11.5px] leading-relaxed">{message.content}</div>
                  ) : message.error ? (
                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {message.error}
                    </p>
                  ) : (
                    <>
                      <Markdown text={message.content || (message.streaming ? '' : '')} className="text-[11.5px]" />
                      {message.streaming && (
                        <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-faint">
                          <Activity className="h-3 w-3 animate-pulse" />
                          {message.content ? 'receiving answer…' : 'assembling grounded context…'}
                        </span>
                      )}
                      {message.notice && (
                        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.04em] text-faint">{message.notice}</p>
                      )}
                      {message.meta && (
                        <>
                          <MetaBadges meta={message.meta} />
                          {message.meta.evidence && <EvidenceGrid evidence={message.meta.evidence} />}
                          {message.meta.reasoning && (
                            <ReasoningPanel
                              reasoning={message.meta.reasoning}
                              quality={message.meta.evidence_quality ?? []}
                            />
                          )}
                          {!!message.meta.recommendation_cards?.length && (
                            <details className="mt-2 rounded border border-lineSoft bg-subtle/60 px-2.5 py-1.5">
                              <summary className="cursor-pointer font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint hover:text-muted">
                                {message.meta.recommendation_cards.length} recommendation card
                                {message.meta.recommendation_cards.length === 1 ? '' : 's'}
                              </summary>
                              <ul className="mt-1.5 space-y-2">
                                {message.meta.recommendation_cards.map((card) => (
                                  <li key={card.id} className="text-[10.5px] leading-relaxed">
                                    <div className="font-medium text-ink">{card.problem}</div>
                                    <div className="text-faint">Action: {card.action}</div>
                                    <div className="text-faint">Benefit: {card.expected_benefit}</div>
                                    <div className="text-faint">Trade-off: {card.tradeoff}</div>
                                    <div className="font-mono text-[8.5px] uppercase tracking-[0.04em] text-faint">
                                      evidence quality · {card.confidence}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      )}
                      {message.proposal && (
                        <ProposalCard
                          proposal={message.proposal}
                          applying={applyingId === message.proposal.proposal_id}
                          onApply={() => void applyProposal(message.id, message.proposal as AIProposal)}
                        />
                      )}
                    </>
                  )}
                </div>
                {message.role === 'user' && (
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-subtle text-muted">
                    <User className="h-3 w-3" />
                  </span>
                )}
              </div>
            ))}

            {pending && !messages.some((message) => message.streaming) && (
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.06em] text-faint">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {pendingKind === 'proposal' ? 'validating the proposed scenario…' : 'assembling grounded context…'}
              </div>
            )}
            {requestError && (
              <div className="flex items-start justify-between gap-3 rounded border border-critical/30 bg-critical/[0.05] px-3 py-2">
                <span className="text-[11px] leading-relaxed text-critical">{requestError}</span>
                <button
                  type="button"
                  className="focus-ring shrink-0 text-faint hover:text-ink"
                  aria-label="Dismiss error"
                  onClick={() => setRequestError(null)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void ask(input)
            }}
            className="border-t border-lineSoft bg-subtle px-4 py-3"
          >
            <label className="block">
              <span className="sr-only">Ask Mirror AI a question</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void ask(input)
                  }
                }}
                rows={2}
                maxLength={2000}
                disabled={disabled}
                placeholder="Ask about capacity, collisions, movement, a solver result or a recovery plan…"
                className="w-full resize-none rounded-md border border-line bg-input px-3 py-2 text-[11.5px] text-ink placeholder:text-faint focus:border-cyan/60 focus:outline-none focus:ring-1 focus:ring-cyan/25 disabled:opacity-50"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">
                {input.length}/2000 · Enter to send · Shift+Enter for a new line
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  iconLeft={<Wand2 className="h-3 w-3" />}
                  disabled={pending || !input.trim() || disabled}
                  onClick={() => void draftProposal(input)}
                >
                  Draft scenario
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={pending || !input.trim() || disabled}
                  iconLeft={<Send className="h-3.5 w-3.5" />}
                >
                  Ask
                </Button>
              </div>
            </div>
          </form>
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader
              eyebrow="Intelligence briefing"
              title="Where the campus stands"
              action={
                <Button
                  size="xs"
                  variant="ghost"
                  loading={briefingLoading}
                  iconLeft={<RefreshCw className="h-3 w-3" />}
                  onClick={loadBriefing}
                >
                  Refresh
                </Button>
              }
            />
            <div className="space-y-2 p-3.5">
              {briefingError ? (
                <p className="text-[10.5px] leading-relaxed text-critical">{briefingError}</p>
              ) : !briefing ? (
                <p className="font-mono text-[9px] uppercase tracking-[0.05em] text-faint">
                  composing from backend data…
                </p>
              ) : (
                <>
                  {briefing.sections.map((section) => (
                    <details
                      key={section.id}
                      open={section.id === 'condition' || section.id === 'issues'}
                      className="rounded border border-lineSoft bg-subtle/50 px-2.5 py-1.5"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint hover:text-muted">
                        <span className="min-w-0 truncate">{section.title}</span>
                        <span className="shrink-0 text-[8px] normal-case tracking-normal">{section.quality.label}</span>
                      </summary>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink">{section.summary}</p>
                      <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted">
                        {section.items.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.04em] text-faint">
                        {section.sources.join(' · ')}
                      </p>
                    </details>
                  ))}
                  <p className="font-mono text-[8px] leading-relaxed text-faint">{briefing.provenance}</p>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Quick actions"
              title="Grounded starting points"
              action={<Badge tone="neutral">{suggestions.filter((item) => item.available).length}</Badge>}
            />
            <div className="space-y-1.5 p-3">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.question}
                  type="button"
                  disabled={!suggestion.available || pending || disabled}
                  onClick={() => void ask(suggestion.question)}
                  className="focus-ring flex w-full items-start justify-between gap-2 rounded border border-line bg-subtle px-2.5 py-1.5 text-left text-[10.5px] leading-snug text-muted transition-colors hover:border-lineHover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  title={suggestion.reason ?? suggestion.question}
                >
                  <span className="min-w-0">{suggestion.label}</span>
                  <ListChecks className="mt-0.5 h-3 w-3 shrink-0 text-faint" />
                </button>
              ))}
              {pageSeed && (
                <button
                  type="button"
                  disabled={pending || disabled}
                  onClick={() => void ask(pageSeed)}
                  className="focus-ring w-full rounded border border-dashed border-cyan/30 px-2.5 py-1.5 text-left text-[10.5px] leading-snug text-cyan/80 hover:border-cyan/50 hover:text-cyan disabled:opacity-40"
                >
                  Contextual · {pageSeed}
                </button>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Provider"
              title="AI configuration"
              action={
                <Button
                  size="xs"
                  variant="ghost"
                  loading={validating}
                  iconLeft={<RefreshCw className="h-3 w-3" />}
                  onClick={() => {
                    setValidating(true)
                    api
                      .aiValidate()
                      .then(({ validation: result }) => {
                        setValidation(result)
                        toast(
                          result.ok ? 'Provider reachable' : 'Provider check failed',
                          result.ok ? 'success' : 'info',
                          result.ok ? `${result.provider} · ${result.model}` : result.hint ?? result.message,
                        )
                      })
                      .catch((error: unknown) =>
                        setValidation({
                          ok: false,
                          message: error instanceof Error ? error.message : 'Validation request failed.',
                        }),
                      )
                      .finally(() => setValidating(false))
                  }}
                >
                  Validate
                </Button>
              }
            />
            <div className="space-y-2 p-3.5">
              {status ? (
                <>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-faint">
                      <Cpu className="h-3 w-3" /> Mode
                    </span>
                    <Badge tone={status.mode === 'language-model' ? 'success' : status.enabled ? 'violet' : 'warning'}>
                      {status.mode}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-faint">Provider</span>
                    <span className="font-mono text-muted">{status.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-faint">Model</span>
                    <span className="font-mono text-muted">{status.model}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-faint">Fallback</span>
                    <span className="font-mono text-muted">{status.fallback_model ?? 'not set'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-[11px]">
                    <span className="text-faint">Key variable</span>
                    <span className="break-all text-right font-mono text-[9.5px] text-muted">{status.key_env}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-faint">Streaming</span>
                    <span className="font-mono text-muted">{status.capabilities?.streaming ? 'enabled' : 'off'}</span>
                  </div>
                  {validation && (
                    <p
                      className={cn(
                        'mt-1 rounded border px-2.5 py-2 text-[10px] leading-relaxed',
                        validation.ok
                          ? 'border-success/25 bg-success/[0.05] text-success'
                          : 'border-warning/25 bg-warning/[0.05] text-warning/90',
                      )}
                    >
                      {validation.ok
                        ? `Reachable · ${validation.display_name ?? validation.model} · output limit ${validation.output_token_limit ?? 'n/a'} tokens`
                        : `${validation.message ?? 'Not reachable'}${validation.hint ? ` ${validation.hint}` : ''}`}
                    </p>
                  )}
                  {!status.configured && status.enabled && (
                    <p className="flex items-start gap-1.5 rounded border border-warning/25 bg-warning/[0.05] px-2.5 py-2 text-[10.5px] leading-relaxed text-warning/90">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      Set {status.key_env} in backend/.env and restart the API to activate a model. The key stays on the
                      server and is never sent to the browser.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-faint">Reading provider status…</p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Grounding" title="Evidence behind the answer" />
            <div className="p-3.5">
              {evidence.length ? (
                <ul className="space-y-1.5">
                  {evidence.map((item) => (
                    <li key={item.label} className="flex items-baseline justify-between gap-3 text-[10.5px]">
                      <span className="min-w-0 truncate text-faint">{item.label}</span>
                      <span className="font-mono tabular-nums text-ink">
                        {typeof item.value === 'number'
                          ? fmtNumber(item.value, Number.isInteger(item.value) ? 0 : 2)
                          : item.value ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-faint">
                  <Database className="mt-0.5 h-3 w-3 shrink-0" />
                  Ask a question to see the exact backend values the answer was built from.
                </p>
              )}
            </div>
          </Panel>

          <Panel className="p-3.5">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan/70" /> What Mirror AI will not do
            </div>
            <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-faint">
              <li>• It never invents rooms, cohorts, distances, energy values or solver statuses.</li>
              <li>• It never calls a heuristic plan optimal, or an infeasible run a recovery.</li>
              <li>• It never claims live tracking, IoT telemetry or real-time occupancy.</li>
              <li>• It never creates or changes a scenario without your explicit confirmation.</li>
              <li>• It says so when the dataset does not contain an answer.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
