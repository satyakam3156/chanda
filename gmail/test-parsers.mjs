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
    expect: { kind: 'card_spend', bank: 'ICICI', last4: '1111', amount: 1497, occurred_on: '2026-11-08', merchant: 'SWIGGY PVT LTD FOOD1' },
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
    expect: { kind: 'card_spend', bank: 'Axis', last4: '2222', amount: 970, occurred_on: '2026-11-08', merchant: 'AIRTEL PAYM' },
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
    expect: { kind: 'account_debit', bank: 'HDFC', last4: '3333', amount: 16000, occurred_on: '2026-11-10', counterparty: 'SOME LANDLORD' },
  },
  {
    name: 'HDFC UPI credit (best guess)',
    sender: 'alerts@hdfcbank.bank.in',
    subject: 'You have received money',
    body: 'Rs.12,500.00 is credited to your account ending 3333 by VPA ****partner@okaxis (PARTNER NAME) on 30-11-26.',
    expect: { kind: 'account_credit', amount: 12500, occurred_on: '2026-11-30', counterparty: 'PARTNER NAME' },
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
