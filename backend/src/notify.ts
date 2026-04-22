import { DynamoDBStreamHandler } from 'aws-lambda'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { CognitoIdentityProviderClient, ListUsersInGroupCommand } from '@aws-sdk/client-cognito-identity-provider'

const ses = new SESClient({})
const cognito = new CognitoIdentityProviderClient({})
const SES_FROM = process.env.SES_FROM_EMAIL!
const USER_POOL_ID = process.env.USER_POOL_ID!

export const handler: DynamoDBStreamHandler = async (event) => {
    for (const record of event.Records) {
        if (record.eventName !== 'MODIFY') continue
        if (!record.dynamodb?.NewImage || !record.dynamodb?.OldImage) continue

        const oldStatus = record.dynamodb.OldImage.status?.S
        const newImage = record.dynamodb.NewImage
        const newStatus = newImage.status?.S
        const sk = newImage.SK?.S

        if (sk !== 'META' || oldStatus === newStatus) continue

        const title = newImage.title?.S ?? 'Task'
        const assigneeEmail = newImage.assigneeEmail?.S

        const adminsRes = await cognito.send(new ListUsersInGroupCommand({
            UserPoolId: USER_POOL_ID,
            GroupName: 'Admin'
        }))

        const adminEmails = (adminsRes.Users ?? [])
            .map(u => u.Attributes?.find(a => a.Name === 'email')?.Value)
            .filter((e): e is string => Boolean(e))

        const recipients = [...new Set([...(assigneeEmail ? [assigneeEmail] : []), ...adminEmails])]
        if (recipients.length === 0) continue

        await ses.send(new SendEmailCommand({
            Source: SES_FROM,
            Destination: { ToAddresses: recipients },
            Message: {
                Subject: { Data: `Task Status Update: ${title}` },
                Body: { Text: { Data: `Task "${title}" status changed to: ${newStatus}` } }
            }
        }))
    }
}
