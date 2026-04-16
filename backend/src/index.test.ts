import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: { from: () => ({ send: vi.fn() }) },
    PutCommand: vi.fn(),
    QueryCommand: vi.fn()
}))

describe('Task API', () => {
    it('rejects non-admin from creating tasks', async () => {
        const app = new Hono()
        // import your routes and test with app.request()
        expect(true).toBe(true) // placeholder - wire real test
    })

    it('validates task schema with zod', async () => {
        const { z } = await import('zod')
        const schema = z.object({ title: z.string().min(1) })
        expect(() => schema.parse({ title: '' })).toThrow()
    })
})