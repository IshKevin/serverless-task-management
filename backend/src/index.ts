import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { Logger } from '@aws-lambda-powertools/logger'
import { z } from 'zod'

const logger = new Logger()
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const ses = new SESClient({})
const app = new Hono()

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const TABLE_NAME = process.env.TABLE_NAME!
const SES_FROM = process.env.SES_FROM_EMAIL!

const STATUS_COLORS: Record<string, string> = {
    OPEN: '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    DONE: '#22c55e',
    CLOSED: '#94a3b8',
}

app.use('*', cors({
    origin: (origin) => origin || '*',
    allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS', 'DELETE'],
}))

// Explicitly handle OPTIONS requests to ensure a 204 OK status for preflights
app.options('*', (c) => c.text('', 204))

// The Hono AWS Lambda adapter passes requestContext directly on c.env
const ctx = (c: any) => (c.env?.requestContext ?? c.env?.event?.requestContext) as any

// Decode the already-verified JWT payload from the Authorization header.
// API Gateway validates the signature before invoking Lambda, so reading
// the payload here is safe and bypasses any claim-extraction quirks.
function jwtPayload(c: any): Record<string, any> {
    try {
        const auth = c.req.header('Authorization') || ''
        const token = auth.replace(/^Bearer\s+/i, '')
        const part = token.split('.')[1]
        if (!part) return {}
        // Node 16+ supports 'base64url' which is standard for JWT parts
        return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    } catch {
        return {}
    }
}

const getGroups = (c: any): string[] => {
    const parse = (raw: any): string[] => {
        if (raw == null || raw === '') return []
        if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
        if (typeof raw === 'string') {
            if (raw.startsWith('[')) {
                try { return JSON.parse(raw) } catch { }
            }
            // Split by comma OR space (API Gateway often joins claims with spaces)
            return raw.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean)
        }
        return []
    }

    // Primary: API Gateway JWT claims (already extracted)
    const rc = ctx(c)
    const claims = rc?.authorizer?.jwt?.claims
    const fromContext = parse(claims?.['cognito:groups'] || claims?.['groups'])
    if (fromContext.length > 0) return fromContext

    // Fallback: decode the JWT payload directly from the Authorization header
    const payload = jwtPayload(c)
    const fromToken = parse(payload['cognito:groups'] || payload['groups'])
    if (fromToken.length > 0) return fromToken

    logger.warn('No cognito:groups found via claims or JWT payload', {
        claims: JSON.stringify(claims ?? {}),
    })
    return []
}

const getEmail = (c: any): string => {
    const rc = ctx(c)
    const fromClaims = rc?.authorizer?.jwt?.claims?.email
    if (fromClaims) return String(fromClaims).toLowerCase()
    return (jwtPayload(c)?.email ?? '').toLowerCase()
}

const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED']

// GET /me — returns the caller's email and groups as seen by the Lambda (diagnostic)
app.get('/me', (c) => {
    const rc = ctx(c)
    const claims = rc?.authorizer?.jwt?.claims ?? {}
    return c.json({ email: getEmail(c), groups: getGroups(c), claims })
})

// POST /tasks — Admin only: create and assign a task
app.post('/tasks', async (c) => {
    const groups = getGroups(c)
    if (!groups.includes('Admin')) return c.json({ error: 'Forbidden' }, 403)

    const body = await c.req.json()
    const schema = z.object({
        title: z.string().min(1),
        description: z.string().default(''),
        assigneeEmail: z.string().email(),
    })

    let task: z.infer<typeof schema>
    try {
        task = schema.parse(body)
    } catch (err: any) {
        return c.json({ error: 'Invalid request', details: err.errors }, 400)
    }

    const assigneeEmail = task.assigneeEmail.toLowerCase()
    const taskId = crypto.randomUUID()
    const item = {
        PK: `TASK#${taskId}`,
        taskId: taskId,
        SK: 'META',
        GSI1PK: `USER#${assigneeEmail}`,
        GSI1SK: `TASK#${taskId}`,
        title: task.title,
        description: task.description,
        assigneeEmail,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
    }

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))

    // Notify the assignee directly when a new task is created.
    // Admins are notified separately via the DynamoDB stream (notify Lambda).
    const color = STATUS_COLORS['OPEN']
    const descHtml = task.description
        ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">${esc(task.description)}</p>`
        : ''

    try {
        await ses.send(new SendEmailCommand({
            Source: SES_FROM,
            Destination: { ToAddresses: [assigneeEmail] },
            Message: {
                Subject: { Data: `New Task Assigned: ${task.title}` },
                Body: {
                    Text: {
                        Data: `You have been assigned a new task: "${task.title}".\n\nLog in to TaskFlow to view and manage this task.`,
                    },
                    Html: {
                        Data: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:24px"><div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)"><div style="background:#6366f1;padding:20px 24px"><h1 style="color:#fff;margin:0;font-size:18px;font-weight:600">New Task Assigned</h1></div><div style="padding:24px"><p style="color:#475569;margin:0 0 16px">You have been assigned a new task in TaskFlow:</p><div style="background:#f1f5f9;border-left:4px solid #6366f1;border-radius:6px;padding:16px;margin-bottom:16px"><h2 style="margin:0 0 6px;font-size:15px;color:#0f172a">${esc(task.title)}</h2>${descHtml}</div><p style="color:#94a3b8;font-size:12px;margin:0">Log in to TaskFlow to view and update your task status.</p></div></div></body></html>`,
                    },
                },
            },
        }))
        logger.info('Assignee notified of new task', { taskId, assigneeEmail })
    } catch (err) {
        logger.warn('Assignee assignment email failed', { taskId, assigneeEmail, err })
    }

    logger.info('Task created', { taskId, assigneeEmail })
    return c.json(item, 201)
})

// GET /tasks — Admins see all tasks; members see only their assigned tasks
app.get('/tasks', async (c) => {
    const email = getEmail(c)
    const groups = getGroups(c)

    if (groups.includes('Admin')) {
        const res = await ddb.send(new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'SK = :sk',
            ExpressionAttributeValues: { ':sk': 'META' },
        }))
        return c.json(res.Items ?? [])
    }

    const res = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${email}` },
    }))
    return c.json(res.Items ?? [])
})

// PATCH /tasks/:id/status — Update status; members can only update their own tasks
app.patch('/tasks/:id/status', async (c) => {
    const taskId = c.req.param('id')
    const body = await c.req.json()
    const { status } = body
    const callerEmail = getEmail(c)
    const groups = getGroups(c)
    const isAdmin = groups.includes('Admin')

    if (!VALID_STATUSES.includes(status)) {
        return c.json({ error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}` }, 400)
    }

    const expressionValues: Record<string, unknown> = { ':s': status }
    let conditionExpression: string

    if (isAdmin) {
        conditionExpression = 'attribute_exists(PK)'
    } else {
        conditionExpression = 'attribute_exists(PK) AND GSI1PK = :user'
        expressionValues[':user'] = `USER#${callerEmail}`
    }

    let updated: Record<string, any> | undefined
    try {
        const result = await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TASK#${taskId}`, SK: 'META' },
            UpdateExpression: 'SET #s = :s',
            ConditionExpression: conditionExpression,
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: expressionValues,
            ReturnValues: 'ALL_NEW',
        }))
        updated = result.Attributes
    } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
            return isAdmin
                ? c.json({ error: 'Task not found' }, 404)
                : c.json({ error: 'Forbidden: task not assigned to you' }, 403)
        }
        logger.error('Status update failed', { taskId, err })
        return c.json({ error: 'Internal server error' }, 500)
    }

    // Notify the assignee directly when someone else changed their task status.
    // Admins are notified separately via the DynamoDB stream (notify Lambda).
    const assigneeEmail = updated?.assigneeEmail as string | undefined
    if (assigneeEmail && assigneeEmail !== callerEmail) {
        const title = (updated?.title as string | undefined) ?? 'Task'
        const description = (updated?.description as string | undefined) ?? ''
        const color = STATUS_COLORS[status] ?? '#6366f1'
        const descHtml = description
            ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">${esc(description)}</p>`
            : ''
        try {
            await ses.send(new SendEmailCommand({
                Source: SES_FROM,
                Destination: { ToAddresses: [assigneeEmail] },
                Message: {
                    Subject: { Data: `Task Status Updated: ${title}` },
                    Body: {
                        Text: {
                            Data: `Your task "${title}" has been updated to ${status}.\n\nLog in to TaskFlow to view the task.`,
                        },
                        Html: {
                            Data: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:24px"><div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)"><div style="background:#0f172a;padding:20px 24px"><h1 style="color:#fff;margin:0;font-size:18px;font-weight:600">Task Status Updated</h1></div><div style="padding:24px"><p style="color:#475569;margin:0 0 16px">Your task status has been updated:</p><div style="background:#f1f5f9;border-left:4px solid ${color};border-radius:6px;padding:16px;margin-bottom:16px"><h2 style="margin:0 0 4px;font-size:15px;color:#0f172a">${esc(title)}</h2>${descHtml}<div style="margin-top:10px"><span style="background:${color};color:#fff;padding:3px 12px;border-radius:99px;font-size:13px;font-weight:600">${esc(status)}</span></div></div><p style="color:#94a3b8;font-size:12px;margin:0">Log in to TaskFlow to view and manage this task.</p></div></div></body></html>`,
                        },
                    },
                },
            }))
            logger.info('Assignee notified of status change', { taskId, assigneeEmail, status })
        } catch (err) {
            logger.warn('Assignee status-change email failed', { taskId, assigneeEmail, err })
        }
    }

    logger.info('Task status updated', { taskId, status, callerEmail })
    return c.json({ ok: true })
})

export { app }
export const handler = handle(app)
