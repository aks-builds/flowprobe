// packages/adapters/sns-sqs/src/index.ts
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import type { BrokerAdapter } from '@flowprobe/core'

export type AwsConfig = {
  region: string
  credentials?: { accessKeyId: string; secretAccessKey: string }
}

export class AwsAdapter implements BrokerAdapter {
  private sns: SNSClient
  private sqs: SQSClient

  constructor(config: AwsConfig) {
    const opts = {
      region: config.region,
      ...(config.credentials ? { credentials: config.credentials } : {}),
    }
    this.sns = new SNSClient(opts)
    this.sqs = new SQSClient(opts)
  }

  async produce(
    topicArn: string,
    payload: unknown,
    headers?: Record<string, string>
  ): Promise<{ messageId: string }> {
    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {
      Source: { DataType: 'String', StringValue: 'flowprobe' },
    }
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        messageAttributes[key] = { DataType: 'String', StringValue: value }
      }
    }
    const result = await this.sns.send(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(payload),
        MessageAttributes: messageAttributes,
      })
    )
    return { messageId: result.MessageId ?? '' }
  }

  async consume(queueUrl: string, _groupId: string, timeoutMs: number): Promise<unknown> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now()
      const waitSec = Math.min(20, Math.floor(remainingMs / 1000))
      if (waitSec <= 0) break
      const resp = await this.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: waitSec,
        })
      )
      if (resp.Messages && resp.Messages.length > 0) {
        const msg = resp.Messages[0]
        await this.sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: msg.ReceiptHandle!,
          })
        )
        try {
          return JSON.parse(msg.Body ?? 'null')
        } catch {
          return msg.Body
        }
      }
    }
    throw new Error(`consume timeout after ${timeoutMs}ms on queue ${queueUrl}`)
  }

  async close(): Promise<void> {
    this.sns.destroy()
    this.sqs.destroy()
  }
}
