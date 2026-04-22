import { DynamoDBStreamHandler } from 'aws-lambda'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import {
    CognitoIdentityProviderClient,
    ListUsersInGroupCommand,
    ListUsersInGroupCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider'
import { Logger } from '@aws-lambda-powertools/logger'

const logger = new Logger()
const ses = new SESClient({})
const cognito = new CognitoIdentityProviderClient({})

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STATUS_COLORS: Record<string, string> = {
    OPEN: '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    DONE: '#22c55e',
    CLOSED: '#94a3b8',
}
const SES_FROM = process.env.SES_FROM_EMAIL!
const USER_POOL_ID = process.env.USER_POOL_ID!

async function getAllAdminEmails(): Promise<string[]> {
    const emails: string[] = []
    let nextToken: string | undefined

    do {
        const res: ListUsersInGroupCommandOutput = await cognito.send(
            new ListUsersInGroupCommand({
                UserPoolId: USER_POOL_ID,
                GroupName: 'Admin',
                NextToken: nextToken,
            })
        )
        for (const user of res.Users ?? []) {
            const email = user.Attributes?.find(a => a.Name === 'email')?.Value
            if (email) emails.push(email)
        }
        nextToken = res.NextToken
    } while (nextToken)

    return emails
}

async function sendEmail(to: string[], bcc: string[], subject: string, text: string, html: string) {
    const toAddresses = [...to]
    let bccAddresses = [...bcc]

    if (toAddresses.length === 0 && bccAddresses.length > 0) {
        toAddresses.push(bccAddresses.shift()!)
    }
    if (toAddresses.length === 0) return

    await ses.send(new SendEmailCommand({
        Source: SES_FROM,
        Destination: {
            ToAddresses: toAddresses,
            ...(bccAddresses.length > 0 ? { BccAddresses: bccAddresses } : {}),
        },
        Message: {
            Subject: { Data: subject },
            Body: {
                Text: { Data: text },
                Html: { Data: html },
            },
        },
    }))
}

export const handler: DynamoDBStreamHandler = async (event) => {
    // Fetch admin emails once for the entire batch
    let adminEmails: string[] = []
    try {
        adminEmails = await getAllAdminEmails()
    } catch (err) {
        logger.warn('Could not fetch admin emails', { err })
    }

    for (const record of event.Records) {
        try {
            if (!record.dynamodb?.NewImage) continue
            const newImage = record.dynamodb.NewImage
            if (newImage.SK?.S !== 'META') continue

            const title = newImage.title?.S ?? 'Task'
            const description = newImage.description?.S ?? ''
            const assigneeEmail = newImage.assigneeEmail?.S

            // ── New task created ──────────────────────────────────────────────
            if (record.eventName === 'INSERT') {
                if (!assigneeEmail) continue

                const toAddresses = [assigneeEmail]
                // Notify admins too (Bcc), excluding the assignee if they are also admin
                const bccSet = new Set(adminEmails)
                bccSet.delete(assigneeEmail)
                const bccAddresses = [...bccSet]

                const descHtml = description
                    ? `<p style="margin:0;font-size:13px;color:#64748b">${esc(description)}</p>`
                    : ''

                try {
                    await sendEmail(
                        toAddresses,
                        bccAddresses,
                        `New Task Assigned: ${title}`,
                        `You have been assigned a new task.\n\nTitle: ${title}${description ? `\nDescription: ${description}` : ''}\n\nLog in to TaskFlow to view and update your task.`,
                        `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:24px"><div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)"><div style="background:#6366f1;padding:20px 24px"><h1 style="color:#fff;margin:0;font-size:18px;font-weight:600">New Task Assigned</h1></div><div style="padding:24px"><p style="color:#475569;margin:0 0 16px">You have been assigned a new task in TaskFlow:</p><div style="background:#f1f5f9;border-left:4px solid #6366f1;border-radius:6px;padding:16px;margin-bottom:16px"><h2 style="margin:0 0 6px;font-size:15px;color:#0f172a">${esc(title)}</h2>${descHtml}</div><p style="color:#64748b;font-size:13px;margin:0 0 8px">Assigned to: <strong>${esc(assigneeEmail)}</strong></p><p style="color:#94a3b8;font-size:12px;margin:0">Log in to TaskFlow to view and update your task status.</p></div></div></body></html>`,
                    )
                    logger.info('Assignment notification sent via stream', { title, assigneeEmail })
                } catch (err) {
                    logger.warn('Assignment email failed (SES)', { title, assigneeEmail, err })
                }
                continue
            }

            // ── Status changed — notify admins (assignee is notified directly by the API handler) ──
            if (record.eventName === 'MODIFY') {
                if (!record.dynamodb.OldImage) continue
                const oldStatus = record.dynamodb.OldImage.status?.S
                const newStatus = newImage.status?.S

                if (oldStatus === newStatus) continue

                // Exclude the assignee — they already received a direct email from the PATCH handler
                const adminOnly = adminEmails.filter(e => e !== assigneeEmail)
                if (adminOnly.length === 0) continue

                const color = STATUS_COLORS[newStatus ?? ''] ?? '#6366f1'
                const descHtml = description
                    ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">${esc(description)}</p>`
                    : ''

                try {
                    await sendEmail(
                        [adminOnly[0]],
                        adminOnly.slice(1),
                        `[Admin] Task Status Update: ${title}`,
                        `Task "${title}" status changed from ${oldStatus} to ${newStatus}.${description ? `\n\n${description}` : ''}\n\nAssignee: ${assigneeEmail ?? 'unknown'}\n\nLog in to TaskFlow to view the task.`,
                        `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:24px"><div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)"><div style="background:#0f172a;padding:20px 24px"><h1 style="color:#fff;margin:0;font-size:18px;font-weight:600">Task Status Update</h1></div><div style="padding:24px"><p style="color:#475569;margin:0 0 16px">A task has been updated in TaskFlow:</p><div style="background:#f1f5f9;border-left:4px solid ${color};border-radius:6px;padding:16px;margin-bottom:16px"><h2 style="margin:0 0 8px;font-size:15px;color:#0f172a">${esc(title)}</h2>${descHtml}<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b;margin-top:10px"><span style="text-decoration:line-through">${esc(oldStatus ?? '')}</span><span style="color:#94a3b8">→</span><span style="background:${color};color:#fff;padding:2px 10px;border-radius:99px;font-weight:600">${esc(newStatus ?? '')}</span></div></div><p style="color:#64748b;font-size:13px;margin:0 0 8px">Assignee: <strong>${esc(assigneeEmail ?? 'unknown')}</strong></p><p style="color:#94a3b8;font-size:12px;margin:0">Log in to TaskFlow to view and manage this task.</p></div></div></body></html>`,
                    )
                    logger.info('Admin status-change notification sent', { title, oldStatus, newStatus, adminCount: adminOnly.length })
                } catch (err) {
                    logger.warn('Admin status-change email failed (SES)', { title, err })
                }
            }
        } catch (err) {
            logger.error('Failed to process stream record', { record: record.eventID, err })
        }
    }
}
