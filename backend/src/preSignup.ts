import { PreSignUpTriggerHandler } from 'aws-lambda'

export const handler: PreSignUpTriggerHandler = async (event) => {
    const email = event.request.userAttributes.email
    const allowed = process.env.ALLOWED_DOMAINS!.split(',')
    const domain = email.split('@')[1]

    if (!allowed.includes(domain)) {
        throw new Error('Email domain not allowed')
    }

    event.response.autoConfirmUser = false
    event.response.autoVerifyEmail = false
    return event
}