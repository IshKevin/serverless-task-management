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

const TABLE_NAME = process.env.TABLE_NAME!
const SES_FROM = process.env.SES_FROM_EMAIL!

app.use('*', cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
}))

const getGroups = (event: any): string[] =>
    event?.requestContext?.authorizer?.jwt?.claims?.['cognito:groups']?.split(',') ?? []

const getEmail = (event: any): string =>
    event?.requestContext?.authorizer?.jwt?.claims?.email ?? ''

app.post('/tasks', async (c) => {
    const groups = getGroups(c.env.event)
    if (!groups.includes('Admin')) return c.json({ error: 'Forbidden' }, 403)

    const body = await c.req.json()
    const schema = z.object({
        title: z.string().min(1),
        description: z.string(),
        assigneeEmail: z.string().email(),
    })
    const task = schema.parse(body)

    const taskId = crypto.randomUUID()
    const item = {
        PK: `TASK#${taskId}`,
        SK: 'META',
        GSI1PK: `USER#${task.assigneeEmail}`,
        GSI1SK: `TASK#${taskId}`,
        ...task,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
    }

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))

    await ses.send(new SendEmailCommand({
        Source: SES_FROM,
        Destination: { ToAddresses: [task.assigneeEmail] },
        Message: {
            Subject: { Data: `New Task Assigned: ${task.title}` },
            Body: { Text: { Data: `You have been assigned a new task.\n\nTitle: ${task.title}\nDescription: ${task.description}` } },
        },
    }))

    logger.info('Task created', { taskId })
    return c.json(item, 201)
})

app.get('/tasks', async (c) => {
    const email = getEmail(c.env.event)
    const groups = getGroups(c.env.event)

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

app.patch('/tasks/:id/status', async (c) => {
    const taskId = c.req.param('id')
    const { status } = await c.req.json()
    const email = getEmail(c.env.event)
    const groups = getGroups(c.env.event)

    const expressionValues: Record<string, unknown> = { ':s': status }
    let conditionExpression: string | undefined

    if (!groups.includes('Admin')) {
        conditionExpression = 'GSI1PK = :user'
        expressionValues[':user'] = `USER#${email}`
    }

    await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TASK#${taskId}`, SK: 'META' },
        UpdateExpression: 'SET #s = :s',
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: expressionValues,
    }))

    return c.json({ ok: true })
})

export const handler = handle(app)
