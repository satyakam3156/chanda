/**
 * Chanda — bank alert parsers.
 *
 * Pure functions: text in, fields out. No Gmail or network calls, so they can be
 * tested outside Google (see gmail/test-parsers.mjs).
 *
 * parseAlert(sender, subject, body) returns one of:
 *   { kind: 'skip', reason }                           — not a transaction (bill payment, promo…)
 *   { kind: 'card_spend' | 'card_credit' | 'account_debit' | 'account_credit',
 *     bank, last4, amount, occurred_on, merchant?, counterparty? }
 *   { kind: 'unreadable' }                             — a bank email we don't recognise yet
 *
 * Formats verified against real emails: ICICI card spend, ICICI payment received,
 * Axis card spend, HDFC UPI debit. HDFC UPI credit is a best guess until a real
 * one arrives; if it doesn't match, it shows up in Chanda as "couldn't read".
 */

var MONTHS_ = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function flat_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function amount_(s) {
  return Number(String(s).replace(/,/g, ''));
}

function iso_(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function senderDomain_(sender) {
  var m = String(sender || '').toLowerCase().match(/@([a-z0-9.-]+)/);
  return m ? m[1] : '';
}

/** Offers and newsletters come from separate sender names, e.g. custcomm.icici.bank.in. */
function isMarketingSender_(domain) {
  return /^(?:custcomm|customer|mailers?|marketing|offers|promotions?|news(?:letter)?)\./.test(domain);
}

/** Emails that are about cards/accounts but aren't spending: never imported. */
function isSkippable_(subject, body) {
  var subj = String(subject || '').toLowerCase();
  var s = (subj + ' ' + body).toLowerCase();
  return (
    // Account notices: statements, charges, reminders.
    /\bstatement\b/.test(subj) ||
    /important update|update on applicable charges|missed call|upcoming payment notification/.test(subj) ||
    // Card auto-debits: the card's own spend alert already covers the charge.
    /standing instruction/.test(subj) ||
    /payment received on your icici bank credit card/.test(s) ||
    /we have received payment of/.test(s) ||
    /credit card bill payment/.test(s) ||
    /payment (?:of|for) .* (?:has been )?received towards your .*credit card/.test(s) ||
    // Only the subject: every alert body carries a "never share your OTP" warning.
    /\b(?:otp|one time password)\b/.test(subj)
  );
}

// ICICI card ----------------------------------------------------------------------
// "Your ICICI Bank Credit Card XX1111 has been used for a transaction of INR 580.00 on
//  Nov 04, 2026 at 07:48:08. Info: Swiggy. The Available Credit Limit…"
function parseIcici_(subject, body) {
  var t = flat_(body);
  var m = t.match(/Credit Card XX(\d{4}) has been used for a transaction of INR ([\d,]+(?:\.\d{1,2})?) on ([A-Za-z]{3}) ?(\d{1,2}), (\d{4})(?: at [\d:]+)?\. Info: (.+?)\. (?:The Available|Available)/);
  if (m) {
    return {
      kind: 'card_spend',
      bank: 'ICICI',
      last4: m[1],
      amount: amount_(m[2]),
      occurred_on: iso_(m[5], MONTHS_[m[3].toLowerCase()], m[4]),
      merchant: m[6].trim(),
    };
  }
  return null;
}

// Axis card -----------------------------------------------------------------------
// Fields: "Transaction Amount: INR 970  Merchant Name: AIRTEL PAYM
//          Axis Bank Credit Card No. XX2222  Date & Time: 08-11-2026, 16:40:23 IST"
function parseAxis_(subject, body) {
  var t = flat_(body);
  var m = t.match(/Transaction Amount:\s*INR\s*([\d,]+(?:\.\d{1,2})?)\s*Merchant Name:\s*(.+?)\s*Axis Bank Credit Card No\.?\s*XX(\d{4})\s*Date & Time:\s*(\d{2})-(\d{2})-(\d{4})/i);
  if (m) {
    var spent = /spent/i.test(subject) || !/(refund|reversal|credited)/i.test(subject);
    return {
      kind: spent ? 'card_spend' : 'card_credit',
      bank: 'Axis',
      last4: m[3],
      amount: amount_(m[1]),
      occurred_on: iso_(m[6], m[5], m[4]),
      merchant: m[2].trim(),
    };
  }
  return parseAxisAccount_(subject, t);
}

// Axis savings account, verified against real emails:
//   UPI  "Amount Debited: INR 800.00  Account Number: XX4444  Date & Time: 07-11-26, 21:08:28 IST
//         Transaction Info: UPI/P2M/123456789012/Blinkit"           (P2A = to a person)
//   ACH  "your A/c no. XX4444 has been debited with INR 10000.00 on 02-11-2026 06:55:02 IST
//         by ACH-DR-SOME COMPANY."
// Fallback: the subject alone ("INR 800.00 was debited from your A/c no. XX4444."),
// with the email's date and no payee.
function parseAxisAccount_(subject, t) {
  var m = t.match(/Amount (Debited|Credited):\s*INR\s*([\d,]+(?:\.\d{1,2})?)\s*Account Number:\s*XX(\d{4})\s*Date & Time:\s*(\d{2})-(\d{2})-(\d{2,4}),?\s*[\d:]+\s*IST\s*Transaction Info:\s*(.+?)\s*(?:If this transaction|Feel free|Call us|Always open|To block|$)/i);
  if (m) {
    var info = m[7].trim();
    var upi = info.match(/^UPI\/P2[AM]\/\d+\/([^\/]+)/i);
    return {
      kind: m[1].toLowerCase() === 'debited' ? 'account_debit' : 'account_credit',
      bank: 'Axis',
      last4: m[3],
      amount: amount_(m[2]),
      occurred_on: iso_(year_(m[6]), m[5], m[4]),
      counterparty: (upi ? upi[1] : info).trim(),
      via: upi ? 'UPI' : undefined,
    };
  }

  var ach = t.match(/A\/c no\.?\s*XX(\d{4}) has been (debited|credited) with INR\s*([\d,]+(?:\.\d{1,2})?) on (\d{2})-(\d{2})-\s*(\d{4})\s*[\d:]*\s*(?:IST)?\s*by (.+?)\.(?:\s|$)/i);
  if (ach) {
    var who = ach[7].trim();
    var via = (who.match(/^(ACH|NACH|NEFT|IMPS|RTGS)\b/i) || [])[1];
    return {
      kind: ach[2].toLowerCase() === 'debited' ? 'account_debit' : 'account_credit',
      bank: 'Axis',
      last4: ach[1],
      amount: amount_(ach[3]),
      occurred_on: iso_(ach[6], ach[5], ach[4]),
      counterparty: who.replace(/^(?:N?ACH|NEFT|IMPS|RTGS)[-\/](?:DR|CR)?[-\/]?/i, '').trim(),
      via: via ? via.toUpperCase() : undefined,
    };
  }

  var s = flat_(subject).match(/^INR\s*([\d,]+(?:\.\d{1,2})?) was (debited|credited) (?:from|to) your A\/c/i);
  if (s) {
    return { kind: s[2].toLowerCase() === 'debited' ? 'account_debit' : 'account_credit', bank: 'Axis', amount: amount_(s[1]) };
  }
  return null;
}

// HDFC account (UPI) --------------------------------------------------------------
// Verified: "Rs.16000.00 is debited from your account ending 3333 towards VPA
//            ****@oksbi (NAME) on 10-11-26."
// Best guess: "Rs.500.00 is credited to your account ending 3333 by VPA ****@okaxis (NAME) on 10-11-26."
function parseHdfc_(subject, body) {
  var t = flat_(body);
  var debit = t.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?) (?:is|has been) debited from (?:your )?(?:a\/c|account)(?: \*+| ending| no\.? (?:XX)?)\s*(\d{4}) (?:towards|to) VPA \S+ \(([^)]+)\) on (\d{2})-(\d{2})-(\d{2,4})/i);
  if (debit) {
    return {
      kind: 'account_debit',
      bank: 'HDFC',
      last4: debit[2],
      amount: amount_(debit[1]),
      occurred_on: iso_(year_(debit[6]), debit[5], debit[4]),
      counterparty: debit[3].trim(),
    };
  }
  var credit = t.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?) (?:is|has been) credited to (?:your )?(?:a\/c|account)(?: \*+| ending| no\.? (?:XX)?)\s*(\d{4}) (?:by|from) VPA \S+ \(([^)]+)\) on (\d{2})-(\d{2})-(\d{2,4})/i);
  if (credit) {
    return {
      kind: 'account_credit',
      bank: 'HDFC',
      last4: credit[2],
      amount: amount_(credit[1]),
      occurred_on: iso_(year_(credit[6]), credit[5], credit[4]),
      counterparty: credit[3].trim(),
    };
  }
  // Verified ("View: Account update for your HDFC Bank A/c"):
  //   "Rs.500.00 has been successfully credited to your HDFC Bank account ending in 3333.
  //    Transaction Details: a. Date: 10-11-26 b. Sender: SOME NAME (VPA: ****@okhdfcbank)"
  var update = t.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?) has been (?:successfully )?(credited|debited) (?:to|from) your HDFC Bank account ending (?:in )?(\d{4})\.?\s*Transaction Details:\s*a\.\s*Date:\s*(\d{2})-(\d{2})-(\d{2,4})\s*b\.\s*(?:Sender|Receiver|Beneficiary|Payee):\s*(.+?)\s*(?:\(VPA|c\.|$)/i);
  if (update) {
    return {
      kind: update[2].toLowerCase() === 'credited' ? 'account_credit' : 'account_debit',
      bank: 'HDFC',
      last4: update[3],
      amount: amount_(update[1]),
      occurred_on: iso_(year_(update[6]), update[5], update[4]),
      counterparty: update[7].trim(),
    };
  }
  return null;
}

function year_(y) {
  return y.length === 2 ? '20' + y : y;
}

/** Entry point. */
function parseAlert(sender, subject, body) {
  var domain = senderDomain_(sender);
  if (isMarketingSender_(domain)) return { kind: 'skip', reason: 'offer or newsletter' };
  if (isSkippable_(subject || '', flat_(body))) return { kind: 'skip', reason: 'not a transaction' };

  var parsed = null;
  if (/icici/.test(domain)) parsed = parseIcici_(subject, body);
  else if (/axis/.test(domain)) parsed = parseAxis_(subject, body);
  else if (/hdfc/.test(domain)) parsed = parseHdfc_(subject, body);

  // occurred_on may be missing (Axis savings): the importer then uses the email's date.
  if (parsed && parsed.amount > 0 && !/NaN|undefined/.test(parsed.occurred_on || '')) return parsed;
  return { kind: 'unreadable' };
}
