import { useAuthenticator } from '@aws-amplify/ui-react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

async function apiCall(path: string, options: RequestInit = {}) {
    const { tokens } = await fetchAuthSession()
    const res = await fetch(`${import.meta.env.VITE_API_ENDPOINT}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens?.idToken?.toString()}`,
            ...options.headers
        }
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export default function App() {
    const { user, signOut } = useAuthenticator()
    const qc = useQueryClient()
    const [title, setTitle] = useState('')

    const { data: tasks } = useQuery({
        queryKey: ['tasks'],
        queryFn: () => apiCall('/tasks')
    })

    const createTask = useMutation({
        mutationFn: (body: any) => apiCall('/tasks', { method: 'POST', body: JSON.stringify(body) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] })
    })

    const groups = user?.getSignInUserSession()?.getIdToken()?.payload['cognito:groups'] || []
    const isAdmin = groups.includes('Admin')

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex justify-between mb-8">
                <h1 className="text-3xl font-bold">Tasks</h1>
                <button onClick={signOut} className="px-4 py-2 bg-red-500 text-white rounded">Sign Out</button>
            </div>

            {isAdmin && (
                <form onSubmit={(e) => {
                    e.preventDefault()
                    createTask.mutate({ title, description: 'New task', assigneeEmail: 'member@amalitech.com' })
                }} className="mb-8 p-4 border rounded">
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" className="border p-2 mr-2" />
                    <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">Create Task</button>
                </form>
            )}

            <div className="space-y-2">
                {tasks?.map((t: any) => (
                    <div key={t.PK} className="p-4 border rounded">
                        <h3 className="font-bold">{t.title}</h3>
                        <p>{t.description}</p>
                        <span className="text-sm text-gray-500">{t.status}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}