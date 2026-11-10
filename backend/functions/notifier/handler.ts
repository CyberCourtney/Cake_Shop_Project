// DynamoDB Stream consumer. Runs after an order is already safely stored.
//
// For each new order (or one flagged with pendingNotify by the admin "resend" button):
//   1. publish the internal alert to SNS (the baker and the operator get the same email);
//   2. send the customer acknowledgement with SES, when customer email is enabled;
//   3. record each result on the order, and set notificationProblem if anything failed.
// When an admin moves an order to Confirmed, Ready for collection or Cancelled, it also
// emails the customer about the change (once per status, recorded in statusEmails).
// A failure is reported back to Lambda, which retries the record (up to 3 times) and then
// sends it to the dead-letter queue, whose alarm emails the ops address. The order itself
// is never touched except for the notification fields.
import type { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { CUSTOMER_EMAIL_STATUSES, type CustomerEmailStatus, type NotificationState, type Order } from "@kvc/shared";
import { ddb, keys, stripKeys, tableName } from "../../lib/db";
import { errorInfo, log } from "../../lib/log";
import { businessInfo, getSettings } from "../../lib/repo";
import { customerEmail, internalMessage, internalSubject, statusEmail } from "./templates";

const sns = new SNSClient({});
const ses = new SESv2Client({});

export const handler = async (event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
  const failures: DynamoDBBatchResponse["batchItemFailures"] = [];
  for (const record of event.Records) {
    try {
      const image = record.dynamodb?.NewImage;
      if (!image) continue;
      type Img = { orderRef?: string; pendingNotify?: string; fulfilmentStatus?: string };
      const next = unmarshall(image as Parameters<typeof unmarshall>[0]) as Img;
      const prev = record.dynamodb?.OldImage ? (unmarshall(record.dynamodb.OldImage as Parameters<typeof unmarshall>[0]) as Img) : undefined;
      const orderRef = next.orderRef;
      if (!orderRef) continue;
      let ok = true;
      // New orders, and the admin "resend" button (which sets pendingNotify).
      if (record.eventName === "INSERT" || next.pendingNotify) ok = await processOrder(orderRef, record.eventName === "MODIFY");
      // A fulfilment status change that the customer should hear about.
      if (record.eventName === "MODIFY" && prev && prev.fulfilmentStatus !== next.fulfilmentStatus && isEmailStatus(next.fulfilmentStatus)) {
        ok = (await processStatusChange(orderRef, next.fulfilmentStatus)) && ok;
      }
      if (!ok) failures.push({ itemIdentifier: record.dynamodb!.SequenceNumber! });
    } catch (err) {
      log.error("notifier record failed", errorInfo(err));
      if (record.dynamodb?.SequenceNumber) failures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
    }
  }
  return { batchItemFailures: failures };
};

/** Returns false if a notification failed and the record should be retried. */
export async function processOrder(orderRef: string, isResend: boolean): Promise<boolean> {
  // Always read the current item: on a retry, the stream image is out of date and would
  // make us send a notification that already succeeded.
  const res = await ddb.send(new GetCommand({ TableName: tableName(), Key: keys.order(orderRef), ConsistentRead: true }));
  if (!res.Item) return true;
  const order = stripKeys(res.Item) as unknown as Order & { pendingNotify?: string };
  const current = order.notifications ?? {};
  const now = new Date().toISOString();

  let internalAlert = current.internalAlert;
  if (internalAlert?.status !== "SENT") internalAlert = await sendInternal(order, isResend, internalAlert, now);

  let customerAck = current.customerAck;
  const emailEnabled = process.env.CUSTOMER_EMAIL_ENABLED === "true";
  if (customerAck?.status !== "SENT") {
    if (emailEnabled) customerAck = await sendCustomer(order, customerAck, now);
    else if (!customerAck) customerAck = { status: "SKIPPED", at: now, reason: "Customer email is switched off until the shop has its own domain." };
  }

  const problem = internalAlert.status === "FAILED" || customerAck?.status === "FAILED";
  await ddb.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.order(orderRef),
      // No version bump: these fields are the notifier's own, and bumping would make an
      // admin's open order look "changed elsewhere".
      UpdateExpression: "SET notifications = :n, notificationProblem = :p REMOVE pendingNotify",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: { ":n": { ...current, internalAlert, ...(customerAck ? { customerAck } : {}) }, ":p": problem },
    }),
  );
  log.info("notifications processed", { orderRef, internal: internalAlert.status, customer: customerAck?.status ?? "none", resend: isResend });
  return !problem;
}

const isEmailStatus = (s: string | undefined): s is CustomerEmailStatus => (CUSTOMER_EMAIL_STATUSES as readonly string[]).includes(s ?? "");

/** Emails the customer that their order is confirmed, ready or cancelled. Returns false to retry. */
export async function processStatusChange(orderRef: string, status: CustomerEmailStatus): Promise<boolean> {
  if (process.env.CUSTOMER_EMAIL_ENABLED !== "true") return true;
  const res = await ddb.send(new GetCommand({ TableName: tableName(), Key: keys.order(orderRef), ConsistentRead: true }));
  if (!res.Item) return true;
  const order = stripKeys(res.Item) as unknown as Order;
  // The status may have moved on again before this ran; only email about the current one.
  if (order.fulfilmentStatus !== status) return true;
  const current = order.notifications ?? {};
  const previous = current.statusEmails?.[status];
  if (previous?.status === "SENT") return true;

  const now = new Date().toISOString();
  let result: NotificationState;
  try {
    const info = businessInfo(await getSettings());
    const msg = statusEmail(order, info, status);
    const replyTo = info.email?.trim();
    const out = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_ADDRESS,
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Destination: { ToAddresses: [order.customer.email] },
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
        Content: { Simple: { Subject: { Data: msg.subject }, Body: { Text: { Data: msg.text }, Html: { Data: msg.html } } } },
      }),
    );
    result = { status: "SENT", at: now, messageId: out.MessageId };
  } catch (err) {
    log.error("status email failed", { orderRef, status, ...errorInfo(err) });
    result = { status: "FAILED", at: now, error: (err as Error).name || "Error", attempts: (previous?.status === "FAILED" ? previous.attempts : 0) + 1 };
  }
  const failed = result.status === "FAILED";
  await ddb.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.order(orderRef),
      // Same rule as above: notifier fields only, no version bump.
      UpdateExpression: failed ? "SET notifications = :n, notificationProblem = :p" : "SET notifications = :n",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: {
        ":n": { ...current, statusEmails: { ...current.statusEmails, [status]: result } },
        ...(failed ? { ":p": true } : {}),
      },
    }),
  );
  log.info("status email processed", { orderRef, status, result: result.status });
  return !failed;
}

async function sendInternal(order: Order, isResend: boolean, previous: NotificationState | undefined, now: string): Promise<NotificationState> {
  try {
    const out = await sns.send(
      new PublishCommand({
        TopicArn: process.env.ORDER_TOPIC_ARN,
        Subject: internalSubject(order, isResend),
        Message: internalMessage(order, process.env.SITE_URL ?? ""),
      }),
    );
    return { status: "SENT", at: now, messageId: out.MessageId };
  } catch (err) {
    log.error("internal alert failed", { orderRef: order.orderRef, ...errorInfo(err) });
    return { status: "FAILED", at: now, error: (err as Error).name || "Error", attempts: (previous?.status === "FAILED" ? previous.attempts : 0) + 1 };
  }
}

async function sendCustomer(order: Order, previous: NotificationState | undefined, now: string): Promise<NotificationState> {
  try {
    const settings = await getSettings();
    const info = businessInfo(settings);
    const msg = customerEmail(order, info);
    // Nothing receives mail at the domain yet, so replies go to the contact address set in
    // the admin portal (Settings > business email).
    const replyTo = info.email?.trim();
    const out = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_ADDRESS,
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Destination: { ToAddresses: [order.customer.email] },
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
        Content: { Simple: { Subject: { Data: msg.subject }, Body: { Text: { Data: msg.text }, Html: { Data: msg.html } } } },
      }),
    );
    return { status: "SENT", at: now, messageId: out.MessageId };
  } catch (err) {
    log.error("customer email failed", { orderRef: order.orderRef, ...errorInfo(err) });
    return { status: "FAILED", at: now, error: (err as Error).name || "Error", attempts: (previous?.status === "FAILED" ? previous.attempts : 0) + 1 };
  }
}
