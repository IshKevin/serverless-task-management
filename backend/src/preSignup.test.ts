import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PreSignUpTriggerEvent, PreSignUpTriggerHandler, Context } from 'aws-lambda'

import { handler } from './preSignup'

function makeEvent(email: string): Parameters<PreSignUpTriggerHandler>[0] {
    return {
        version: '1',
        triggerSource: 'PreSignUp_SignUp',
        region: 'eu-west-1',
        userPoolId: 'eu-west-1_test',
        callerContext: { awsSdkVersion: '3', clientId: 'test' },
        userName: email,
        request: { userAttributes: { email }, validationData: null },
        response: {},
    } as any
}

const CONTEXT = {} as Context
const CALLBACK = () => {}

describe('preSignup handler — domain allowlist', () => {
    const originalEnv = process.env.ALLOWED_DOMAINS

    beforeEach(() => {
        process.env.ALLOWED_DOMAINS = 'amalitech.com,amalitechtraining.org'
    })

    afterEach(() => {
        process.env.ALLOWED_DOMAINS = originalEnv
    })

    it('allows @amalitech.com emails through', async () => {
        const event = makeEvent('alice@amalitech.com')
        const result = await handler(event, CONTEXT, CALLBACK)
        expect(result).toBeDefined()
        expect(result!.response.autoConfirmUser).toBe(false)
        expect(result!.response.autoVerifyEmail).toBe(false)
    })

    it('allows @amalitechtraining.org emails through', async () => {
        const event = makeEvent('bob@amalitechtraining.org')
        const result = await handler(event, CONTEXT, CALLBACK)
        expect(result).toBeDefined()
        expect(result!.response.autoConfirmUser).toBe(false)
    })

    it('blocks emails from unlisted domains', async () => {
        const event = makeEvent('attacker@gmail.com')
        await expect(handler(event, CONTEXT, CALLBACK)).rejects.toThrow('Email domain not allowed')
    })

    it('blocks emails from partial-match domains (e.g. fake-amalitech.com)', async () => {
        const event = makeEvent('user@fake-amalitech.com')
        await expect(handler(event, CONTEXT, CALLBACK)).rejects.toThrow('Email domain not allowed')
    })

    it('throws when ALLOWED_DOMAINS env var is missing', async () => {
        delete process.env.ALLOWED_DOMAINS
        const event = makeEvent('user@amalitech.com')
        await expect(handler(event, CONTEXT, CALLBACK)).rejects.toThrow('ALLOWED_DOMAINS is not configured')
    })

    it('throws when email attribute is missing from event', async () => {
        const event = makeEvent('')
        event.request.userAttributes.email = ''
        await expect(handler(event, CONTEXT, CALLBACK)).rejects.toThrow('Email attribute is missing')
    })
})
