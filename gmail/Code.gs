/**
 * Chanda — Gmail importer (Google Apps Script).
 *
 * Runs inside your own Google account every 15 minutes. Reads new bank alert
 * emails, extracts only date / amount / merchant or payee / bank, and sends them
 * to Chanda's Inbox. Email bodies never leave Google.
 *
 * One-time setup: see docs/STEP7-BANK-EMAILS.md
 *   Project Settings → Script properties:
 *     SUPABASE_URL      https://<project>.supabase.co
 *     SUPABASE_KEY      your publishable key (sb_publishable_…)
 *     INGEST_SECRET     the value shown when you ran 0007_email_ingest.sql
 *     SEND_LAST4        optional, 'true' only if two cards of one bank need telling apart.
 *                       Otherwise card digits never leave Google.
 *   Then run setup() once.
 */

// Bank senders to read. Add a domain here if a bank starts using a new one.
var BANK_SENDERS = ['icici.bank.in', 'icicibank.com', 'axis.bank.in', 'axisbank.com', 'hdfcbank.bank.in', 'hdfcbank.net', 'hdfcbank.com'];

/** Run once: checks settings, then imports every 15 minutes. */
function setup() {
  config_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importNew') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importNew').timeBased().everyMinutes(15).create();
  Logger.log('Chanda: importing every 15 minutes. Running a first import now…');
  importNew();
}

/** Called by the trigger. Looks back 3 days; Chanda ignores emails it already has. */
function importNew() {
  importSince_('3d');
}

/** Run by hand to import older alerts, e.g. the whole current month: backfill(31). */
function backfill(days) {
  importSince_((days || 31) + 'd');
}

function importSince_(window) {
  var cfg = config_();
  var me = Session.getEffectiveUser().getEmail();
  var query = '(' + BANK_SENDERS.map(function (d) { return 'from:' + d; }).join(' OR ') + ') newer_than:' + window;
  var counts = { inbox: 0, confirmed: 0, duplicate: 0, miss: 0, skip: 0, error: 0 };
  var start = 0;

  while (true) {
    var threads = GmailApp.search(query, start, 100);
    if (threads.length === 0) break;
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        try {
          var sender = msg.getFrom();
          if (!BANK_SENDERS.some(function (d) { return sender.toLowerCase().indexOf(d) !== -1; })) return;
          var subject = msg.getSubject();
          var parsed = parseAlert(sender, subject, msg.getPlainBody());
          if (parsed.kind === 'skip') {
            counts.skip++;
            return;
          }
          var alert = parsed.kind === 'unreadable'
            ? { kind: 'unreadable', sender: senderDomain_(sender), subject: subject }
            : parsed;
          if (!cfg.sendLast4) delete alert.last4;
          alert.source_ref = msg.getId();
          alert.mailbox = me;
          if (!alert.occurred_on) alert.occurred_on = Utilities.formatDate(msg.getDate(), 'Asia/Kolkata', 'yyyy-MM-dd');
          var result = send_(cfg, alert);
          counts[result] = (counts[result] || 0) + 1;
        } catch (e) {
          counts.error++;
          Logger.log('Chanda: failed on message ' + msg.getId() + ': ' + e);
        }
      });
    });
    if (threads.length < 100) break;
    start += 100;
  }
  Logger.log('Chanda import (' + window + '): ' + JSON.stringify(counts));
}

/**
 * Run by hand when Chanda lists emails it "couldn't read": logs the plain text the
 * script sees for those emails (last `days`, default 7), with numbers that could be
 * card/account/phone digits masked. Nothing is sent anywhere. Copy the log to Claude.
 */
function showUnreadable(days) {
  var query = '(' + BANK_SENDERS.map(function (d) { return 'from:' + d; }).join(' OR ') + ') newer_than:' + (days || 7) + 'd';
  GmailApp.search(query, 0, 100).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var parsed = parseAlert(msg.getFrom(), msg.getSubject(), msg.getPlainBody());
      if (parsed.kind !== 'unreadable') return;
      Logger.log('----- ' + msg.getSubject() + '\n' + mask_(msg.getPlainBody()).slice(0, 1500));
    });
  });
}

/** Hides emails and digit runs that aren't amounts, dates or times. */
function mask_(text) {
  var keep = [];
  function protect(m) { keep.push(m); return '\u0000' + (keep.length - 1) + '\u0000'; }
  return String(text)
    .replace(/\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/g, protect)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, protect)
    .replace(/(?:INR|Rs\.?|USD|₹)\s?[\d,]+(?:\.\d+)?/g, protect)
    .replace(/\b\d[\d,]*\.\d{2}\b/g, protect)
    .replace(/[\w.+-]+@[\w.-]+/g, '<…@…>')
    .replace(/\d{3,}/g, function (m) { return new Array(m.length + 1).join('#'); })
    .replace(/\u0000(\d+)\u0000/g, function (_, i) { return keep[Number(i)]; });
}

function send_(cfg, alert) {
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/ingest_bank_alert', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
    payload: JSON.stringify({ p_secret: cfg.secret, p_alert: alert }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Chanda said ' + res.getResponseCode() + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function config_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    url: String(p.getProperty('SUPABASE_URL') || '').replace(/\/+$/, ''),
    key: p.getProperty('SUPABASE_KEY'),
    secret: p.getProperty('INGEST_SECRET'),
    sendLast4: p.getProperty('SEND_LAST4') === 'true',
  };
  if (!cfg.url || !cfg.key || !cfg.secret) {
    throw new Error('Set SUPABASE_URL, SUPABASE_KEY and INGEST_SECRET in Project Settings → Script properties.');
  }
  return cfg;
}
