// Tests for gmail/Parsers.gs, runnable without Google: node gmail/test-parsers.mjs
// The examples copy each bank's wording with made-up amounts, names and card digits.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const ctx = {}
vm.createContext(ctx)
vm.runInContext(readFileSync(new URL('./Parsers.gs', import.meta.url), 'utf8'), ctx)
const parse = (sender, subject, body) => ctx.parseAlert(sender, subject, body)

const cases = [
  {
    name: 'ICICI card spend',
    sender: 'ICICI Bank <credit_cards@icici.bank.in>',
    subject: 'Transaction alert for your ICICI Bank Credit Card',
    body: `Dear Customer,
Your ICICI Bank Credit Card XX1111 has been used for a transaction of INR 1,497.00 on Nov
08, 2026 at 01:15:11. Info: SWIGGY PVT LTD FOOD1.
The Available Credit Limit on your card is INR 2,43,913.16 and Total Credit Limit is INR 2,60,000.00.`,
    expect: { kind: 'card_spend', bank: 'ICICI', last4: '1111', amount: 1497, occurred_on: '2026-11-08', merchant: 'SWIGGY PVT LTD FOOD1', occurred_time: '01:15:11' },
  },
  {
    name: 'ICICI merchant with a star',
    sender: 'credit_cards@icici.bank.in',
    subject: 'Transaction alert for your ICICI Bank Credit Card',
    body: 'Your ICICI Bank Credit Card XX1111 has been used for a transaction of INR 99.00 on Oct 1, 2026 at 09:00:00. Info: RAZ*Swiggy. The Available Credit Limit…',
    expect: { kind: 'card_spend', amount: 99, occurred_on: '2026-10-01', merchant: 'RAZ*Swiggy' },
  },
  {
    name: 'ICICI payment received is skipped',
    sender: 'credit_cards@icici.bank.in',
    subject: 'Payment received on your ICICI Bank Credit Card.',
    body: 'Dear Customer, We have received payment of INR 28,000.00 on your ICICI Bank Credit Card account 1234 XXXX XXXX 1111 on 02-Nov-2026.',
    expect: { kind: 'skip' },
  },
  {
    name: 'Axis card spend',
    sender: 'Axis Bank Alerts <alerts@axis.bank.in>',
    subject: 'INR 970 spent on credit card no. XX2222',
    body: `Here's the summary of your Axis Bank Credit Card Transaction:
Transaction Amount:
INR 970
Merchant Name:
AIRTEL PAYM
Axis Bank Credit Card No.
XX2222
Date & Time:
08-11-2026, 16:40:23 IST
Available Limit*:`,
    expect: { kind: 'card_spend', bank: 'Axis', last4: '2222', amount: 970, occurred_on: '2026-11-08', merchant: 'AIRTEL PAYM', occurred_time: '16:40:23' },
  },
  {
    name: 'HDFC UPI debit',
    sender: 'HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>',
    subject: '❗ You have done a UPI txn. Check details!',
    body: `Dear Customer,
Greetings from HDFC Bank!
Rs.16000.00 is debited from your account ending 3333 towards VPA
**********landlord@oksbi (SOME LANDLORD) on 10-11-26.
UPI transaction reference no.: 123456789012.`,
    expect: { kind: 'account_debit', bank: 'HDFC', last4: '3333', amount: 16000, occurred_on: '2026-11-10', counterparty: 'SOME LANDLORD', occurred_time: undefined },
  },
  {
    name: 'HDFC UPI credit (best guess)',
    sender: 'alerts@hdfcbank.bank.in',
    subject: 'You have received money',
    body: 'Rs.12,500.00 is credited to your account ending 3333 by VPA ****partner@okaxis (PARTNER NAME) on 30-11-26.',
    expect: { kind: 'account_credit', amount: 12500, occurred_on: '2026-11-30', counterparty: 'PARTNER NAME' },
  },
  {
    name: 'Axis savings UPI debit to a merchant',
    sender: 'alerts@axis.bank.in',
    subject: 'INR 1373.00 was debited from your A/c no. XX4444.',
    body: `07-11-2026
Dear Customer,
Here's the summary of your transaction:
Amount Debited:
INR 1373.00
Account Number:
XX4444
Date & Time:
07-11-26, 21:08:28 IST
Transaction Info:
UPI/P2M/123456789012/Blinkit
If this transaction was not initiated by you:`,
    expect: { kind: 'account_debit', bank: 'Axis', last4: '4444', amount: 1373, occurred_on: '2026-11-07', counterparty: 'Blinkit', via: 'UPI', occurred_time: '21:08:28' },
  },
  {
    name: 'Axis savings UPI credit from a person',
    sender: 'Axis Bank Alerts <alerts@axis.bank.in>',
    subject: 'INR 2000.00 was credited to your A/c.',
    body: `Amount Credited:
INR 2000.00
Account Number:
XX4444
Date & Time:
09-11-26, 23:44:20 IST
Transaction Info:
UPI/P2A/123456789012/SOME PERSON /HDFC/UPI
Feel free to connect with us for any clarification.`,
    expect: { kind: 'account_credit', amount: 2000, occurred_on: '2026-11-09', counterparty: 'SOME PERSON' },
  },
  {
    name: 'Axis savings ACH debit',
    sender: 'alerts@axis.bank.in',
    subject: 'Debit transaction alert for Axis Bank A/c',
    body: `Thank you for banking with us.
We wish to inform you that your A/c no. XX4444 has been debited with INR 10000.00 on 02-11-
2026 06:55:02 IST by ACH-DR-SOME FUND HOUSE P.
To check your available balance, please click here.`,
    expect: { kind: 'account_debit', bank: 'Axis', amount: 10000, occurred_on: '2026-11-02', counterparty: 'SOME FUND HOUSE P', via: 'ACH', occurred_time: '06:55:02' },
  },
  {
    name: 'Axis savings, unknown body: subject only',
    sender: 'alerts@axis.bank.in',
    subject: 'INR 2000.00 was credited to your A/c.',
    body: 'A body we have not seen yet',
    expect: { kind: 'account_credit', bank: 'Axis', amount: 2000, counterparty: undefined },
  },
  {
    name: 'HDFC account update (credit)',
    sender: 'HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>',
    subject: 'View: Account update for your HDFC Bank A/c',
    body: `Dear Customer,
Greetings from HDFC Bank!
We're writing to inform you that Rs.67500.00 has been successfully credited
to your HDFC Bank account ending in 3333.
Transaction Details:
a. Date: 10-11-26
b. Sender: SOME PERSON (VPA: ****@okhdfcbank)
c. UPI Reference No.: 123456789012`,
    expect: { kind: 'account_credit', bank: 'HDFC', amount: 67500, occurred_on: '2026-11-10', counterparty: 'SOME PERSON' },
  },
  {
    name: 'ICICI standing instruction is skipped (the spend alert covers it)',
    sender: 'credit_cards@icici.bank.in',
    subject: 'Transaction Success notification for Standing Instruction on your ICICI Bank Credit Card',
    body: 'We have successfully processed your payment of INR 79.00 towards Amazon',
    expect: { kind: 'skip' },
  },
  {
    name: 'Offers from the marketing sender are skipped',
    sender: 'ICICI Bank <offers@custcomm.icici.bank.in>',
    subject: 'Turn festive cheer into four-wheeled joy',
    body: 'Car loan at INR 1,00,000',
    expect: { kind: 'skip' },
  },
  {
    name: 'Monthly statement is skipped',
    sender: 'alerts@axis.bank.in',
    subject: 'AXIS BANK : Statement for October 2026',
    body: 'Your statement is attached.',
    expect: { kind: 'skip' },
  },
  {
    name: 'Account notice is skipped',
    sender: 'alerts@axis.bank.in',
    subject: 'Important update regarding IMPS charges on your savings account',
    body: 'Charges of INR 5 apply.',
    expect: { kind: 'skip' },
  },
  {
    name: 'Invisible characters between words still parse',
    sender: 'alerts@axis.bank.in',
    subject: 'INR 699.00 was debited from your A/c no. XX4444.',
    body: 'Amount Debited:\nINR 699.00\nAccount Number:\nXX4444\nDate & Time:\n10-11-26, 09:00:00 IST\nTransaction Info:\nUPI/P2M/123456789012/LIVPURE\n\nIf\u200b this transaction was not initiated by you:\nTo block UPI: SMS BLOCKUPI',
    expect: { kind: 'account_debit', amount: 699, counterparty: 'LIVPURE' },
  },
  ...['AXIS BANK : EMI Letter with Monthly EMI Details', 'Upcoming AutoPay txn. reminder', 'No Dues Certificates of EMI on your Axis Bank Credit Card', 'Your say on HDFC Bank New MobileBanking experience', 'Your Axis Bank Atlas Credit Card ending XX12 - October 2026'].map((subject) => ({
    name: `Notice skipped: ${subject.slice(0, 40)}`,
    sender: 'alerts@axis.bank.in',
    subject,
    body: 'INR 1,000',
    expect: { kind: 'skip' },
  })),
  {
    name: 'ICICI with bold markers and a link in the plain text',
    sender: 'credit_cards@icici.bank.in',
    subject: 'Transaction alert for your ICICI Bank Credit Card',
    body: 'Your ICICI Bank Credit Card XX1111 has been used for a transaction of *INR 300.00* on Nov\n11, 2026 at 06:45:18. Info: *Swiggy Instamart*. <https://example.com/x>\nThe Available Credit Limit on your card is INR 2,30,830.16',
    expect: { kind: 'card_spend', amount: 300, occurred_on: '2026-11-11', merchant: 'Swiggy Instamart', occurred_time: '06:45:18' },
  },
  {
    name: 'Axis card, second layout',
    sender: 'alerts@axis.bank.in',
    subject: 'Transaction alert on Axis Bank Credit Card',
    body: `Here's the summary of your Axis Bank Credit Card transaction:
Transaction amount (INR): INR 51802
Merchant name: SOME AIRL
Axis Bank Credit Card No.: XX2222
Date and time: 16-10-2026 18:17:57 IST
Available limit (INR): 683138.63`,
    expect: { kind: 'card_spend', bank: 'Axis', amount: 51802, occurred_on: '2026-10-16', merchant: 'SOME AIRL', currency: undefined, occurred_time: '18:17:57' },
  },
  {
    name: 'Axis card in USD: sent with currency for the Inbox',
    sender: 'alerts@axis.bank.in',
    subject: 'USD 23.6 spent on credit card no. XX2222',
    body: `Transaction Amount:
USD 23.6
Merchant Name:
SOME AI
Axis Bank Credit Card No.
XX2222
Date & Time:
28-10-2026, 10:36:29 IST`,
    expect: { kind: 'card_spend', amount: 23.6, currency: 'USD', foreign_amount: 23.6, merchant: 'SOME AI', occurred_on: '2026-10-28' },
  },
  {
    name: 'Axis savings interest is skipped',
    sender: 'alerts@axis.bank.in',
    subject: 'Credit transaction alert for Axis Bank A/c',
    body: 'We wish to inform you that your A/c no. XX4444 has been credited with INR 8.00 on 11-05-2026 at\n14:48:37 IST by SB 123456789012345 Int.Pd .\nTo check your available balance',
    expect: { kind: 'skip' },
  },
  {
    name: 'Axis ACH credit with "at" before the time',
    sender: 'alerts@axis.bank.in',
    subject: 'Credit transaction alert for Axis Bank A/c',
    body: 'your A/c no. XX4444 has been credited with INR 5,000.00 on 01-11-2026 at 10:00:00 IST by NEFT-SOME EMPLOYER 123456789 .',
    expect: { kind: 'account_credit', amount: 5000, occurred_on: '2026-11-01', counterparty: 'SOME EMPLOYER', via: 'NEFT', occurred_time: '10:00:00' },
  },
  {
    name: 'ICICI declined transaction is skipped',
    sender: 'credit_cards@icici.bank.in',
    subject: 'Transaction alert for your ICICI Bank Credit Card',
    body: 'As the service for international online transactions is disabled, your\ntransaction of INR 399.00 using your ICICI Bank Credit Card XX1111, has\nbeen declined on Nov 11, 2026 at 05:10:54.',
    expect: { kind: 'skip' },
  },
  {
    name: 'HDFC "verify a declined transaction" is skipped',
    sender: 'alerts@hdfcbank.bank.in',
    subject: 'Urgent: Verify Your Recent UPI Transaction with HDFC Bank',
    body: 'We tried reaching you to verify and confirm a recent declined transaction. Amount: Rs.7000',
    expect: { kind: 'skip' },
  },
  {
    name: 'Unknown bank format is reported, not guessed',
    sender: 'alerts@axis.bank.in',
    subject: 'Refund processed on your credit card',
    body: 'Something we have not seen before INR 500',
    expect: { kind: 'unreadable' },
  },
]

let failed = 0
for (const c of cases) {
  const got = parse(c.sender, c.subject, c.body)
  const bad = Object.entries(c.expect).filter(([k, v]) => got[k] !== v)
  if (bad.length) {
    failed++
    console.log(`✗ ${c.name}\n   expected ${JSON.stringify(c.expect)}\n   got      ${JSON.stringify(got)}`)
  } else {
    console.log(`✓ ${c.name}`)
  }
}
console.log(failed ? `\n${failed} failed` : '\nAll passed')
process.exit(failed ? 1 : 0)
