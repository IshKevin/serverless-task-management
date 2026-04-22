import { PreSignUpTriggerHandler } from 'aws-lambda'

export const handler: PreSignUpTriggerHandler = async (event) => {
    const email = event.request.userAttributes.email
    if (!email) throw new Error('Email attribute is missing')

    const allowedDomainsEnv = process.env.ALLOWED_DOMAINS
    if (!allowedDomainsEnv) throw new Error('ALLOWED_DOMAINS is not configured')

    const allowed = allowedDomainsEnv.split(',').map((d: string) => d.trim())
    const domain = email.split('@')[1]

    if (!domain || !allowed.includes(domain)) {
        throw new Error('Email domain not allowed')
    }

    event.response.autoConfirmUser = false
    event.response.autoVerifyEmail = false
    return event
}