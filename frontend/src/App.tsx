import { useAuthenticator } from '@aws-amplify/ui-react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

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

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
    OPEN:        { label: 'Open',        cls: 'bg-blue-50   text-blue-700  ring-blue-200'  },
    IN_PROGRESS: { label: 'In Progress', cls: 'bg-amber-50  text-amber-700 ring-amber-200' },
    DONE:        { label: 'Done',        cls: 'bg-green-50  text-green-700 ring-green-200' },
    CLOSED:      { label: 'Closed',      cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}
const STATUSES = Object.keys(STATUS_CONFIG)

type Task = {
    PK: string
    title: string
    description?: string
    assigneeEmail: string
    status: string
    createdAt: string
}

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.OPEN
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cfg.cls}`}>
            {cfg.label}
        </span>
    )
}

function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
            <div className="h-3 bg-slate-100 rounded w-2/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-1/4" />
        </div>
    )
}

export default function App() {
    const { signOut } = useAuthenticator()
    const qc = useQueryClient()
    const [form, setForm] = useState({ title: '', description: '', assigneeEmail: '' })
    const [showCreate, setShowCreate] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [userEmail, setUserEmail] = useState('')

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
        mutationFn: (body: typeof form) =>
            apiCall('/tasks', { method: 'POST', body: JSON.stringify(body) }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasks'] })
            setForm({ title: '', description: '', assigneeEmail: '' })
            setShowCreate(false)
        },
    })

    const updateStatus = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            apiCall(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    })

    const counts = STATUSES.reduce(
        (acc, s) => ({ ...acc, [s]: tasks.filter(t => t.status === s).length }),
        {} as Record<string, number>
    )

    return (
        <div className="min-h-screen bg-slate-50">
            {/* ── Header ── */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 grid place-items-center shrink-0">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <span className="font-semibold text-slate-900 text-lg">TaskFlow</span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <span className="hidden sm:block text-sm text-slate-400 truncate max-w-[180px]">{userEmail}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset shrink-0 ${
                            isAdmin ? 'bg-purple-50 text-purple-700 ring-purple-200' : 'bg-blue-50 text-blue-700 ring-blue-200'
                        }`}>
                            {isAdmin ? 'Admin' : 'Member'}
                        </span>
                        {isAdmin && (
                            <button
                                onClick={() => setShowCreate(v => !v)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
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

                {/* ── Create Task Panel ── */}
                {isAdmin && showCreate && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-semibold text-slate-900">Create New Task</h2>
                            <button
                                onClick={() => setShowCreate(false)}
                                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <form
                            onSubmit={e => { e.preventDefault(); createTask.mutate(form) }}
                            className="px-6 py-5 space-y-4"
                        >
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Title *</label>
                                    <input
                                        value={form.title}
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                        placeholder="e.g. Fix login page"
                                        required
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
                            <div className="flex items-center gap-3">
                                <button
                                    type="submit"
                                    disabled={createTask.isPending}
                                    className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    {createTask.isPending ? 'Creating…' : 'Create Task'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCreate(false)}
                                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                {createTask.isError && (
                                    <span className="text-sm text-red-500">
                                        {(createTask.error as Error).message}
                                    </span>
                                )}
                            </div>
                        </form>
                    </div>
                )}

                {/* ── Stats (Admin) ── */}
                {isAdmin && !isLoading && tasks.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {STATUSES.map(s => (
                            <div key={s} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                                <p className="text-xs text-slate-400 mb-1">{STATUS_CONFIG[s].label}</p>
                                <p className="text-2xl font-bold text-slate-900">{counts[s] ?? 0}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Task List ── */}
                <div>
                    {!isLoading && !isError && (
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                            {isAdmin ? 'All Tasks' : 'My Tasks'} · {tasks.length}
                        </p>
                    )}

                    {isLoading && (
                        <div className="space-y-3">
                            <SkeletonCard /><SkeletonCard /><SkeletonCard />
                        </div>
                    )}

                    {isError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
                            Failed to load tasks — check the API URL and your authentication token.
                        </div>
                    )}

                    {!isLoading && !isError && tasks.length === 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
                            <p className="text-slate-400 text-sm">No tasks yet.</p>
                            {isAdmin && (
                                <button
                                    onClick={() => setShowCreate(true)}
                                    className="mt-3 text-sm text-indigo-600 hover:underline"
                                >
                                    Create the first task →
                                </button>
                            )}
                        </div>
                    )}

                    <div className="space-y-3">
                        {tasks.map(t => {
                            const taskId = t.PK.replace('TASK#', '')
                            return (
                                <div
                                    key={t.PK}
                                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-start gap-4"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-slate-900 truncate">{t.title}</h3>
                                            <StatusBadge status={t.status} />
                                        </div>
                                        {t.description && (
                                            <p className="text-sm text-slate-500 mb-2 line-clamp-2">{t.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                            <span>{t.assigneeEmail}</span>
                                            <span>·</span>
                                            <span>{new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <select
                                            value={t.status}
                                            onChange={e => updateStatus.mutate({ id: taskId, status: e.target.value })}
                                            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                        >
                                            {STATUSES.map(s => (
                                                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </main>
        </div>
    )
}
