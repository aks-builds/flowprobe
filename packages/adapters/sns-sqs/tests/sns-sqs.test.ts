// packages/adapters/sns-sqs/tests/sns-sqs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSnsSend = vi.hoisted(() => vi.fn().mockResolvedValue({ MessageId: 'msg-001' }))
const mockSnsDestroy = vi.hoisted(() => vi.fn())
const mockSqsSend = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    Messages: [{ Body: '{"event":"order.created"}', ReceiptHandle: 'rh-1' }],
  })
)
const mockSqsDestroy = vi.hoisted(() => vi.fn())

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(() => ({
    send: mockSnsSend,
    destroy: mockSnsDestroy,
  })),
  PublishCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({
    send: mockSqsSend,
    destroy: mockSqsDestroy,
  })),
  ReceiveMessageCommand: vi.fn().mockImplementation((input) => ({ input })),
  DeleteMessageCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

import { AwsAdapter } from '../src/index.js'

describe('AwsAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSnsSend.mockResolvedValue({ MessageId: 'msg-001' })
    mockSqsSend.mockResolvedValue({
      Messages: [{ Body: '{"event":"order.created"}', ReceiptHandle: 'rh-1' }],
    })
  })

  describe('produce', () => {
    it('returns messageId from SNS response', async () => {
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      const result = await adapter.produce('arn:aws:sns:us-east-1:123:orders', { orderId: 'ord_001' })
      expect(result.messageId).toBe('msg-001')
    })

    it('returns empty string when MessageId is undefined', async () => {
      mockSnsSend.mockResolvedValue({})
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      const result = await adapter.produce('arn:aws:sns:us-east-1:123:orders', { orderId: 'ord_001' })
      expect(result.messageId).toBe('')
    })

    it('serialises payload as JSON in PublishCommand', async () => {
      const { PublishCommand } = await import('@aws-sdk/client-sns')
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      await adapter.produce('arn:aws:sns:us-east-1:123:orders', { orderId: 'ord_001' })
      expect(PublishCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TopicArn: 'arn:aws:sns:us-east-1:123:orders',
          Message: JSON.stringify({ orderId: 'ord_001' }),
        })
      )
    })

    it('includes Source flowprobe in MessageAttributes', async () => {
      const { PublishCommand } = await import('@aws-sdk/client-sns')
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      await adapter.produce('arn:aws:sns:us-east-1:123:orders', {})
      const [callArg] = (PublishCommand as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(callArg.MessageAttributes.Source).toEqual({
        DataType: 'String',
        StringValue: 'flowprobe',
      })
    })

    it('merges headers into MessageAttributes', async () => {
      const { PublishCommand } = await import('@aws-sdk/client-sns')
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      await adapter.produce('arn:aws:sns:us-east-1:123:orders', {}, { 'X-Trace-Id': 'trace-abc' })
      const [callArg] = (PublishCommand as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(callArg.MessageAttributes['X-Trace-Id']).toEqual({
        DataType: 'String',
        StringValue: 'trace-abc',
      })
    })
  })

  describe('consume', () => {
    it('returns parsed JSON message body', async () => {
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      const msg = await adapter.consume('https://sqs.us-east-1.amazonaws.com/123/orders', 'fp-group', 5000)
      expect(msg).toEqual({ event: 'order.created' })
    })

    it('deletes message after receive', async () => {
      const { DeleteMessageCommand } = await import('@aws-sdk/client-sqs')
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      await adapter.consume('https://sqs.us-east-1.amazonaws.com/123/orders', 'fp-group', 5000)
      expect(DeleteMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ReceiptHandle: 'rh-1' })
      )
    })

    it('returns raw body when JSON.parse fails', async () => {
      mockSqsSend
        .mockResolvedValueOnce({
          Messages: [{ Body: 'plain-text-body', ReceiptHandle: 'rh-2' }],
        })
        .mockResolvedValue({})
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      const msg = await adapter.consume('https://sqs.us-east-1.amazonaws.com/123/orders', 'fp-group', 5000)
      expect(msg).toBe('plain-text-body')
    })

    it('throws timeout error when no messages arrive', async () => {
      mockSqsSend.mockResolvedValue({ Messages: [] })
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      await expect(
        adapter.consume('https://sqs.us-east-1.amazonaws.com/123/empty', 'fp-group', 100)
      ).rejects.toThrow('consume timeout after 100ms')
    })

    it('uses credentials when provided', async () => {
      const { SQSClient } = await import('@aws-sdk/client-sqs')
      const adapter = new AwsAdapter({
        region: 'eu-west-1',
        credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      })
      await adapter.consume('https://sqs.eu-west-1.amazonaws.com/123/q', 'fp-group', 5000)
      expect(SQSClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'eu-west-1',
          credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
        })
      )
    })
  })

  describe('close', () => {
    it('calls destroy on both SNS and SQS clients', async () => {
      const adapter = new AwsAdapter({ region: 'us-east-1' })
      await adapter.close()
      expect(mockSnsDestroy).toHaveBeenCalledTimes(1)
      expect(mockSqsDestroy).toHaveBeenCalledTimes(1)
    })
  })

  describe('constructor', () => {
    it('constructs without credentials (uses ambient AWS auth)', async () => {
      const { SNSClient } = await import('@aws-sdk/client-sns')
      new AwsAdapter({ region: 'ap-southeast-1' })
      expect(SNSClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'ap-southeast-1' })
      )
      const [callArg] = (SNSClient as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(callArg).not.toHaveProperty('credentials')
    })
  })
})
