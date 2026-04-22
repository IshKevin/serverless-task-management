import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import './amplify'

async function apiCall(path: string, options: RequestInit = {}) {
    const { tokens } = await fetchAuthSession()
    const res = await fetch(`${import.meta.env.VITE_API_ENDPOINT}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens?.idToken?.toString()}`,
            ...options.headers,
        },
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string; border: string; dot: string }> = {
    OPEN:        { label: 'Open',        badge: 'bg-blue-50 text-blue-700 ring-blue-200',    border: 'border-l-blue-400',   dot: 'bg-blue-400' },
    IN_PROGRESS: { label: 'In Progress', badge: 'bg-amber-50 text-amber-700 ring-amber-200', border: 'border-l-amber-400',  dot: 'bg-amber-400' },
    DONE:        { label: 'Done',        badge: 'bg-green-50 text-green-700 ring-green-200', border: 'border-l-green-500',  dot: 'bg-green-500' },
    CLOSED:      { label: 'Closed',      badge: 'bg-slate-100 text-slate-500 ring-slate-200', border: 'border-l-slate-300', dot: 'bg-slate-300' },
}
const STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED'] as const
type Status = typeof STATUSES[number]

// ── Types ─────────────────────────────────────────────────────────────────────

type Task = {
    PK: string
    taskId: string
    title: string
    description?: string
    assigneeEmail: string
    status: string
    createdAt: string
}

type ToastItem = { id: string; msg: string; type: 'ok' | 'err' }

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toaster({ items, onRemove }: { items: ToastItem[]; onRemove: (id: string) => void }) {
    if (!items.length) return null
    return (
        <div className="fixed bottom-5 right-5 space-y-2 z-50 pointer-events-none">
            {items.map(t => (
                <div
                    key={t.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-xs pointer-events-auto
                        ${t.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
                >
                    <span className="shrink-0">{t.type === 'ok' ? '✓' : '✕'}</span>
                    <span className="flex-1">{t.msg}</span>
                    <button onClick={() => onRemove(t.id)} className="opacity-70 hover:opacity-100 text-lg leading-none ml-1">×</button>
                </div>
            ))}
        </div>
    )
}

function useToast() {
    const [items, setItems] = useState<ToastItem[]>([])
    const add = useCallback((msg: string, type: ToastItem['type'] = 'ok') => {
        const id = crypto.randomUUID()
        setItems(prev => [...prev, { id, msg, type }])
        setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4000)
    }, [])
    const remove = useCallback((id: string) => setItems(prev => prev.filter(t => t.id !== id)), [])
    return { items, add, remove }
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OPEN
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-slate-200 p-5 animate-pulse">
            <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-2/5" />
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
            </div>
        </div>
    )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    'bg-indigo-100 text-indigo-700',
    'bg-rose-100 text-rose-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-sky-100 text-sky-700',
    'bg-purple-100 text-purple-700',
]

function Avatar({ email }: { email: string }) {
    const initials = email.split('@')[0].slice(0, 2).toUpperCase()
    const color = AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length]
    return (
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 ${color}`}>
            {initials}
        </span>
    )
}

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
    task,
    onStatusChange,
    isPending,
}: {
    task: Task
    onStatusChange: (id: string, status: string) => void
    isPending: boolean
}) {
    const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.OPEN
    return (
        <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${cfg.border} shadow-sm p-5 flex flex-col sm:flex-row sm:items-start gap-4 hover:shadow-md transition-shadow`}>
            <Avatar email={task.assigneeEmail} />
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 truncate">{task.title}</h3>
                    <StatusBadge status={task.status} />
                </div>
                {task.description && (
                    <p className="text-sm text-slate-500 mb-2 line-clamp-2">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="truncate max-w-[220px]">{task.assigneeEmail}</span>
                    <span aria-hidden>·</span>
                    <span>{new Date(task.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
            </div>
            <div className="shrink-0">
                <select
                    value={task.status}
                    onChange={e => onStatusChange(task.taskId, e.target.value)}
                    disabled={isPending}
                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                    ))}
                </select>
            </div>
        </div>
    )
}

// ── Create Task Form ──────────────────────────────────────────────────────────

function CreateForm({
    onSubmit,
    onCancel,
    isPending,
    error,
}: {
    onSubmit: (data: { title: string; description: string; assigneeEmail: string }) => void
    onCancel: () => void
    isPending: boolean
    error?: string
}) {
    const [form, setForm] = useState({ title: '', description: '', assigneeEmail: '' })

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onCancel])

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
                <div>
                    <h2 className="font-semibold text-slate-900">Create New Task</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Assignee will receive an email notification automatically</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl leading-none mt-0.5">×</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); onSubmit(form) }} className="px-6 py-5 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Title *</label>
                        <input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Fix login page"
                            required
                            autoFocus
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Assignee Email *</label>
                        <input
                            value={form.assigneeEmail}
                            onChange={e => setForm(f => ({ ...f, assigneeEmail: e.target.value }))}
                            placeholder="member@amalitech.com"
                            type="email"
                            required
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                    <textarea
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="What needs to be done?"
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
                    >
                        {isPending ? (
                            <>
                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Creating…
                            </>
                        ) : 'Create Task'}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    {error && (
                        <span className="text-sm text-red-500 flex-1 min-w-0 truncate">{error}</span>
                    )}
                </div>
            </form>
        </div>
    )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
    status,
    count,
    active,
    onClick,
}: {
    status: Status
    count: number
    active: boolean
    onClick: () => void
}) {
    const cfg = STATUS_CONFIG[status]
    return (
        <button
            onClick={onClick}
            className={`bg-white rounded-xl border p-4 text-left transition-all hover:shadow-sm w-full ${
                active ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-sm' : 'border-slate-200'
            }`}
        >
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <p className="text-xs text-slate-500 font-medium">{cfg.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{count}</p>
        </button>
    )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ filterStatus, isAdmin, onCreateClick }: {
    filterStatus: Status | 'ALL'
    isAdmin: boolean
    onCreateClick: () => void
}) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 grid place-items-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            </div>
            <p className="text-slate-500 font-medium text-sm">
                {filterStatus !== 'ALL'
                    ? `No ${STATUS_CONFIG[filterStatus]?.label.toLowerCase()} tasks`
                    : 'No tasks yet'}
            </p>
            {isAdmin && filterStatus === 'ALL' && (
                <button onClick={onCreateClick} className="mt-3 text-sm text-indigo-600 hover:underline">
                    Create the first task →
                </button>
            )}
        </div>
    )
}

// ── Main App ──────────────────────────────────────────────────────────────────

function TaskApp() {
    const { signOut } = useAuthenticator()
    const qc = useQueryClient()
    const { items: toasts, add: addToast, remove: removeToast } = useToast()

    const [showCreate, setShowCreate] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [userEmail, setUserEmail] = useState('')
    const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL')

    useEffect(() => {
        fetchAuthSession().then(({ tokens }) => {
            const groups = (tokens?.idToken?.payload['cognito:groups'] as string[]) ?? []
            setIsAdmin(groups.includes('Admin'))
            setUserEmail((tokens?.idToken?.payload.email as string) ?? '')
        })
    }, [])

    const { data: tasks = [], isLoading, isError } = useQuery<Task[]>({
        queryKey: ['tasks'],
        queryFn: () => apiCall('/tasks'),
    })

    const createTask = useMutation({
        mutationFn: (body: { title: string; description: string; assigneeEmail: string }) =>
            apiCall('/tasks', { method: 'POST', body: JSON.stringify(body) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            setShowCreate(false)
            addToast('Task created — assignee notified by email', 'ok')
        },
        onError: (err: Error) => addToast(err.message || 'Failed to create task', 'err'),
    })

    const updateStatus = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            apiCall(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            addToast('Status updated — team notified by email', 'ok')
        },
        onError: (err: Error) => addToast(err.message || 'Failed to update status', 'err'),
    })

    const counts = STATUSES.reduce(
        (acc, s) => ({ ...acc, [s]: tasks.filter(t => t.status === s).length }),
        {} as Record<Status, number>,
    )

    const filtered = filterStatus === 'ALL' ? tasks : tasks.filter(t => t.status === filterStatus)

    return (
        <div className="min-h-screen bg-slate-50">

            {/* ── Header ── */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 grid place-items-center shrink-0">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <span className="font-bold text-slate-900 text-lg tracking-tight">TaskFlow</span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <span className="hidden sm:block text-sm text-slate-400 truncate max-w-[200px]">{userEmail}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset shrink-0 ${
                            isAdmin
                                ? 'bg-purple-50 text-purple-700 ring-purple-200'
                                : 'bg-blue-50 text-blue-700 ring-blue-200'
                        }`}>
                            {isAdmin ? 'Admin' : 'Member'}
                        </span>
                        {isAdmin && (
                            <button
                                onClick={() => setShowCreate(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors shrink-0"
                            >
                                <span className="text-base leading-none">+</span>
                                <span className="hidden sm:inline">New Task</span>
                            </button>
                        )}
                        <button
                            onClick={signOut}
                            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

                {/* ── Create Form ── */}
                {isAdmin && showCreate && (
                    <CreateForm
                        onSubmit={data => createTask.mutate(data)}
                        onCancel={() => setShowCreate(false)}
                        isPending={createTask.isPending}
                        error={createTask.isError ? (createTask.error as Error).message : undefined}
                    />
                )}

                {/* ── Stats (Admin only, when tasks exist) ── */}
                {isAdmin && !isLoading && tasks.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {STATUSES.map(s => (
                            <StatCard
                                key={s}
                                status={s}
                                count={counts[s] ?? 0}
                                active={filterStatus === s}
                                onClick={() => setFilterStatus(prev => prev === s ? 'ALL' : s)}
                            />
                        ))}
                    </div>
                )}

                {/* ── Task List ── */}
                <div>
                    {!isLoading && !isError && (
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                {isAdmin ? 'All Tasks' : 'My Tasks'}
                                {filterStatus !== 'ALL' && ` · ${STATUS_CONFIG[filterStatus]?.label}`}
                                {' · '}{filtered.length}
                            </p>
                            {filterStatus !== 'ALL' && (
                                <button
                                    onClick={() => setFilterStatus('ALL')}
                                    className="text-xs text-indigo-600 hover:underline"
                                >
                                    Clear filter
                                </button>
                            )}
                        </div>
                    )}

                    {isLoading && (
                        <div className="space-y-3">
                            <SkeletonCard /><SkeletonCard /><SkeletonCard />
                        </div>
                    )}

                    {isError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm">
                            <p className="font-semibold text-red-700 mb-1">Failed to load tasks</p>
                            <p className="text-red-500">Check your API URL and authentication session. Try signing out and back in if the issue persists.</p>
                        </div>
                    )}

                    {!isLoading && !isError && filtered.length === 0 && (
                        <EmptyState
                            filterStatus={filterStatus}
                            isAdmin={isAdmin}
                            onCreateClick={() => setShowCreate(true)}
                        />
                    )}

                    {!isLoading && !isError && filtered.length > 0 && (
                        <div className="space-y-3">
                            {filtered.map(t => (
                                <TaskCard
                                    key={t.PK}
                                    task={t}
                                    onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                                    isPending={updateStatus.isPending}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Toaster items={toasts} onRemove={removeToast} />
        </div>
    )
}

export default function App() {
    return (
        <Authenticator>
            <TaskApp />
        </Authenticator>
    )
}
