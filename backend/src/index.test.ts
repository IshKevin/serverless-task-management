import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock send handles — must be hoisted with vi.hoisted
const mocks = vi.hoisted(() => ({
    ddbSend: vi.fn(),
    sesSend: vi.fn(),
}))

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn(() => ({})),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: () => ({ send: mocks.ddbSend }) },
    PutCommand: vi.fn(args => ({ _cmd: 'Put', ...args })),
    QueryCommand: vi.fn(args => ({ _cmd: 'Query', ...args })),
    ScanCommand: vi.fn(args => ({ _cmd: 'Scan', ...args })),
    UpdateCommand: vi.fn(args => ({ _cmd: 'Update', ...args })),
}))

vi.mock('@aws-sdk/client-ses', () => ({
    SESClient: vi.fn(() => ({ send: mocks.sesSend })),
    SendEmailCommand: vi.fn(args => ({ _cmd: 'SendEmail', ...args })),
}))

vi.mock('@aws-lambda-powertools/logger', () => ({
    Logger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

process.env.TABLE_NAME = 'Tasks-test'
process.env.SES_FROM_EMAIL = 'noreply@amalitech.com'

import { app } from './index'

// Helper: build the fake Lambda event that Hono reads via c.env.event
function makeLambdaEnv(email: string, groups: string[]) {
    return {
        event: {
            requestContext: {
                authorizer: {
                    jwt: {
                        claims: {
                            email,
                            'cognito:groups': groups.join(','),
                        },
                    },
                },
            },
        },
    }
}

describe('POST /tasks', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns 403 for non-admin users', async () => {
        const res = await app.request(
            '/tasks',
            { method: 'POST', body: JSON.stringify({ title: 'T', assigneeEmail: 'a@amalitech.com' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('member@amalitech.com', ['Member']),
        )
        expect(res.status).toBe(403)
    })

    it('creates a task and returns 201 for admins', async () => {
        mocks.ddbSend.mockResolvedValueOnce({})
        mocks.sesSend.mockResolvedValueOnce({})

        const res = await app.request(
            '/tasks',
            {
                method: 'POST',
                body: JSON.stringify({ title: 'Fix bug', description: 'Urgent', assigneeEmail: 'dev@amalitech.com' }),
                headers: { 'Content-Type': 'application/json' },
            },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(201)
        const data = await res.json() as any
        expect(data.title).toBe('Fix bug')
        expect(data.status).toBe('OPEN')
        expect(data.assigneeEmail).toBe('dev@amalitech.com')
        expect(mocks.ddbSend).toHaveBeenCalledOnce()
    })

    it('returns 400 for missing or invalid fields', async () => {
        const res = await app.request(
            '/tasks',
            { method: 'POST', body: JSON.stringify({ title: '' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(400)
    })

    it('continues even when SES send fails (sandbox mode)', async () => {
        mocks.ddbSend.mockResolvedValueOnce({})
        mocks.sesSend.mockRejectedValueOnce(new Error('SES sandbox'))

        const res = await app.request(
            '/tasks',
            {
                method: 'POST',
                body: JSON.stringify({ title: 'T', assigneeEmail: 'x@amalitech.com' }),
                headers: { 'Content-Type': 'application/json' },
            },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(201)
    })
})

describe('GET /tasks', () => {
    beforeEach(() => vi.clearAllMocks())

    it('uses ScanCommand for admins (all tasks)', async () => {
        mocks.ddbSend.mockResolvedValueOnce({ Items: [{ PK: 'TASK#1', SK: 'META', title: 'T1' }] })

        const res = await app.request('/tasks', { method: 'GET' }, makeLambdaEnv('admin@amalitech.com', ['Admin']))
        expect(res.status).toBe(200)
        const data = await res.json() as any[]
        expect(data).toHaveLength(1)

        const call = mocks.ddbSend.mock.calls[0][0]
        expect(call._cmd).toBe('Scan')
    })

    it('uses QueryCommand on GSI1 for members (own tasks only)', async () => {
        mocks.ddbSend.mockResolvedValueOnce({ Items: [] })

        const res = await app.request('/tasks', { method: 'GET' }, makeLambdaEnv('member@amalitech.com', ['Member']))
        expect(res.status).toBe(200)

        const call = mocks.ddbSend.mock.calls[0][0]
        expect(call._cmd).toBe('Query')
        expect(call.IndexName).toBe('GSI1')
        expect(call.ExpressionAttributeValues[':pk']).toBe('USER#member@amalitech.com')
    })

    it('returns empty array when no tasks found', async () => {
        mocks.ddbSend.mockResolvedValueOnce({ Items: undefined })

        const res = await app.request('/tasks', { method: 'GET' }, makeLambdaEnv('admin@amalitech.com', ['Admin']))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([])
    })
})

describe('PATCH /tasks/:id/status', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns 400 for invalid status values', async () => {
        const res = await app.request(
            '/tasks/abc/status',
            { method: 'PATCH', body: JSON.stringify({ status: 'INVALID' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(400)
    })

    it('allows admin to update any task status', async () => {
        mocks.ddbSend.mockResolvedValueOnce({})

        const res = await app.request(
            '/tasks/task-123/status',
            { method: 'PATCH', body: JSON.stringify({ status: 'IN_PROGRESS' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(200)
        expect(mocks.ddbSend).toHaveBeenCalledOnce()

        const call = mocks.ddbSend.mock.calls[0][0]
        expect(call.Key).toEqual({ PK: 'TASK#task-123', SK: 'META' })
        expect(call.ConditionExpression).toBe('attribute_exists(PK)')
    })

    it('returns 404 when admin updates a non-existent task', async () => {
        const err = Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' })
        mocks.ddbSend.mockRejectedValueOnce(err)

        const res = await app.request(
            '/tasks/ghost/status',
            { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(404)
    })

    it('returns 403 when member tries to update a task not assigned to them', async () => {
        const err = Object.assign(new Error('Condition failed'), { name: 'ConditionalCheckFailedException' })
        mocks.ddbSend.mockRejectedValueOnce(err)

        const res = await app.request(
            '/tasks/other-task/status',
            { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('member@amalitech.com', ['Member']),
        )
        expect(res.status).toBe(403)
    })

    it('adds GSI1PK condition for member updates', async () => {
        mocks.ddbSend.mockResolvedValueOnce({})

        await app.request(
            '/tasks/my-task/status',
            { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('member@amalitech.com', ['Member']),
        )
        const call = mocks.ddbSend.mock.calls[0][0]
        expect(call.ConditionExpression).toContain('GSI1PK = :user')
        expect(call.ExpressionAttributeValues[':user']).toBe('USER#member@amalitech.com')
    })

    it('returns 500 on unexpected DynamoDB errors', async () => {
        mocks.ddbSend.mockRejectedValueOnce(new Error('Network timeout'))

        const res = await app.request(
            '/tasks/x/status',
            { method: 'PATCH', body: JSON.stringify({ status: 'DONE' }), headers: { 'Content-Type': 'application/json' } },
            makeLambdaEnv('admin@amalitech.com', ['Admin']),
        )
        expect(res.status).toBe(500)
    })
})
