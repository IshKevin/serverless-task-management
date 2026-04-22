import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Hoist mock handles so factories can reference them ─────────────────────────
const mocks = vi.hoisted(() => ({
    fetchAuthSession: vi.fn(),
    signOut: vi.fn(),
    fetch: vi.fn(),
}))

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: mocks.fetchAuthSession }))
vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }))
vi.mock('@aws-amplify/ui-react', () => ({
    useAuthenticator: () => ({ signOut: mocks.signOut }),
    Authenticator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.stubGlobal('fetch', mocks.fetch)

import App from './App'

const ADMIN_SESSION = {
    tokens: {
        idToken: {
            payload: { email: 'admin@amalitech.com', 'cognito:groups': ['Admin'] },
            toString: () => 'admin-token',
        },
    },
}

const MEMBER_SESSION = {
    tokens: {
        idToken: {
            payload: { email: 'member@amalitech.com', 'cognito:groups': ['Member'] },
            toString: () => 'member-token',
        },
    },
}

function renderApp() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
    return render(
        <QueryClientProvider client={qc}>
            <App />
        </QueryClientProvider>,
    )
}

describe('App — Admin view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.fetchAuthSession.mockResolvedValue(ADMIN_SESSION)
    })

    it('shows "New Task" button for admin users', async () => {
        mocks.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        })

        renderApp()

        await waitFor(() => {
            expect(screen.getByText(/New Task/i)).toBeInTheDocument()
        })
    })

    it('shows Admin badge in header', async () => {
        mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

        renderApp()

        await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument())
    })

    it('renders task list returned by the API', async () => {
        mocks.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                {
                    PK: 'TASK#1',
                    title: 'Fix login bug',
                    assigneeEmail: 'dev@amalitech.com',
                    status: 'OPEN',
                    createdAt: new Date().toISOString(),
                },
            ],
        })

        renderApp()

        await waitFor(() => expect(screen.getByText('Fix login bug')).toBeInTheDocument())
        expect(screen.getByText('dev@amalitech.com')).toBeInTheDocument()
    })

    it('shows the create task form when "New Task" is clicked', async () => {
        mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

        renderApp()

        const btn = await screen.findByText(/New Task/i)
        fireEvent.click(btn)

        await waitFor(() => expect(screen.getByText('Create New Task')).toBeInTheDocument())
        expect(screen.getByPlaceholderText(/Fix login page/i)).toBeInTheDocument()
    })

    it('displays stats grid when tasks exist', async () => {
        mocks.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { PK: 'TASK#1', title: 'T1', assigneeEmail: 'a@amalitech.com', status: 'OPEN', createdAt: new Date().toISOString() },
                { PK: 'TASK#2', title: 'T2', assigneeEmail: 'b@amalitech.com', status: 'DONE', createdAt: new Date().toISOString() },
            ],
        })

        renderApp()

        // "Open" and "Done" appear in the stats grid, badges, and select options — use getAllByText
        await waitFor(() => expect(screen.getAllByText('Open').length).toBeGreaterThan(0))
        expect(screen.getAllByText('Done').length).toBeGreaterThan(0)
    })
})

describe('App — Member view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.fetchAuthSession.mockResolvedValue(MEMBER_SESSION)
    })

    it('does NOT show "New Task" button for members', async () => {
        mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

        renderApp()

        await waitFor(() => expect(screen.getByText('Member')).toBeInTheDocument())
        expect(screen.queryByText(/New Task/i)).not.toBeInTheDocument()
    })

    it('shows Member badge in header', async () => {
        mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

        renderApp()

        await waitFor(() => expect(screen.getByText('Member')).toBeInTheDocument())
    })

    it('shows "My Tasks" label for members', async () => {
        mocks.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { PK: 'TASK#1', title: 'My task', assigneeEmail: 'member@amalitech.com', status: 'IN_PROGRESS', createdAt: new Date().toISOString() },
            ],
        })

        renderApp()

        await waitFor(() => expect(screen.getByText(/My Tasks/i)).toBeInTheDocument())
    })
})

describe('App — error state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.fetchAuthSession.mockResolvedValue(ADMIN_SESSION)
    })

    it('shows error banner when API call fails', async () => {
        mocks.fetch.mockResolvedValueOnce({ ok: false, text: async () => 'Unauthorized' })

        renderApp()

        await waitFor(() =>
            expect(screen.getByText(/Failed to load tasks/i)).toBeInTheDocument(),
        )
    })
})
