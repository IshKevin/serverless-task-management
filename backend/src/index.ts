import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { Logger } from '@aws-lambda-powertools/logger'
import { z } from 'zod'

const logger = new Logger()
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const ses = new SESClient({})
const app = new Hono()

const TABLE_NAME = process.env.TABLE_NAME!

const getGroups = (event: any): string[] => {
    return event.requestContext?.authorizer?.jwt?.claims?.['cognito:groups']?.split(',') || []
}

app.post('/tasks', async (c) => {
    const groups = getGroups(c.env.lambdaEvent)
    if (!groups.includes('Admin')) return c.json({ error: 'Forbidden' }, 403)

    const body = await c.req.json()
    const schema = z.object({
        title: z.string().min(1),
        description: z.string(),
        assigneeEmail: z.string().email()
    })
    const task = schema.parse(body)

    const taskId = crypto.randomUUID()
    const item = {
        PK: `TASK#${taskId}`,
        SK: `META`,
        GSI1PK: `USER#${task.assigneeEmail}`,
        GSI1SK: `TASK#${taskId}`,
        ...task,
        status: 'OPEN',
        createdAt: new Date().toISOString()
    }

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))

    await ses.send(new SendEmailCommand({
        Source: 'noreply@yourdomain.com',
        Destination: { ToAddresses: [task.assigneeEmail] },
        Message: {
            Subject: { Data: `New Task: ${task.title}` },
            Body: { Text: { Data: `You've been assigned: ${task.description}` } }
        }
    }))

    logger.info('Task created', { taskId })
    return c.json(item, 201)
})

app.get('/tasks', async (c) => {
    const email = c.env.lambdaEvent.requestContext?.authorizer?.jwt?.claims?.email
    const res = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${email}` }
    }))
    return c.json(res.Items || [])
})

app.patch('/tasks/:id/status', async (c) => {
    const taskId = c.req.param('id')
    const { status } = await c.req.json()
    const email = c.env.lambdaEvent.requestContext?.authorizer?.jwt?.claims?.email

    await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TASK#${taskId}`, SK: 'META' },
        UpdateExpression: 'SET #s = :s',
        ConditionExpression: 'GSI1PK = :user',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status, ':user': `USER#${email}` }
    }))

    return c.json({ ok: true })
})

export const handler = handle(app)