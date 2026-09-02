const BRAND_COLOR = '#1a73e8';

const ROLE_ACCOUNTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'mailer', 'mailer-daemon',
  'postmaster', 'webmaster', 'abuse', 'security', 'privacy', 'info', 'infos',
  'support', 'help', 'hello', 'hi', 'contact', 'team', 'sales', 'billing',
  'accounts', 'admin', 'office', 'hr', 'media', 'press', 'newsletter',
  'service', 'services', 'feedback', 'jobs', 'careers', 'customer-service'
];

function smartIntroHomepage() {
  var section = CardService.newCardSection()
    .setHeader('How it works')
    .addWidget(CardService.newTextParagraph().setText(
      'While composing an email, click the SmartIntro icon in the compose window ' +
      'and hit <b>Insert greeting</b>. SmartIntro reads the people in the To field ' +
      'and writes a greeting like <i>Hey Sarah!</i> into your message.'))
    .addWidget(CardService.newTextParagraph().setText(
      'Names are resolved from your <b>Google Contacts</b> first, then from the ' +
      'display names of past emails you received from the same address, then from ' +
      'the address itself. If a name cannot be found, that recipient is skipped.'));
  return [CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('SmartIntro'))
    .addSection(section)
    .build()];
}

function smartIntroCompose(e) {
  try {
    var recipients = getToRecipients(e);
    if (!recipients.length) {
      return [messageCard('No recipients yet', 'Add recipients to the To field, then click the SmartIntro icon again.')];
    }

    var resolved = recipients.map(function (raw) {
      var email = normalizeEmail(raw);
      return { email: email, name: resolveDisplayName(email) };
    });

    var missing = resolved.filter(function (r) { return !r.name; });
    var named = resolved.filter(function (r) { return r.name; });

    if (!named.length) {
      return [messageCard('No names found', noNameMessage(missing))];
    }

    var greeting = buildGreeting(named.map(function (r) { return r.name; }));

    var section = CardService.newCardSection().setHeader('Recipients');
    named.forEach(function (r) {
      section.addWidget(CardService.newDecoratedText()
        .setIcon(CardService.Icon.PERSON)
        .setText(r.name)
        .setBottomLabel(r.email));
    });
    if (missing.length) {
      section.addWidget(CardService.newTextParagraph().setText(
        '<b>Not greeted</b> (no name found): ' +
        missing.map(function (r) { return r.email; }).join(', ')));
    }

    var action = CardService.newAction()
      .setFunctionName('insertSmartIntroGreeting')
      .setParameters({ greeting: greeting });
    var insertButton = CardService.newTextButton()
      .setText('Insert greeting')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor(BRAND_COLOR)
      .setOnClickAction(action);

    var previewSection = CardService.newCardSection().setHeader('Will insert');
    previewSection.addWidget(CardService.newTextParagraph().setText(
      '"' + greeting.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '"'));

    return [CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle('SmartIntro'))
      .addSection(section)
      .addSection(previewSection)
      .addSection(CardService.newCardSection().addWidget(insertButton))
      .build()];
  } catch (err) {
    return [messageCard('SmartIntro error', String(err))];
  }
}

function insertSmartIntroGreeting(e) {
  var parameters = e && ((e.commonEventObject && e.commonEventObject.parameters) || e.parameters) || {};
  var greeting = parameters.greeting || 'Hey there!';
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(greeting + '\n\n', CardService.ContentType.TEXT)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}

function getToRecipients(e) {
  if (!e) return [];
  var lists = [];
  if (e.gmail && Array.isArray(e.gmail.toRecipients)) lists.push(e.gmail.toRecipients);
  if (Array.isArray(e.toRecipients)) lists.push(e.toRecipients);
  if (e.draftMetadata && Array.isArray(e.draftMetadata.toRecipients)) lists.push(e.draftMetadata.toRecipients);
  return lists.length ? lists[0] : [];
}

function resolveDisplayName(email) {
  if (!email) return null;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'smartintro-name-' + email;
  var cached = cache.get(cacheKey);
  if (cached !== null) return cached === '_' ? null : cached;

  var name = null;
  try {
    name = contactGivenName(email);
  } catch (err) {}
  if (!name) {
    try {
      name = mailboxDisplayName(email);
    } catch (err) {}
  }
  if (!name && !isRoleAccount(email)) name = parseLocalPartName(email);

  cache.put(cacheKey, name || '_', 600);
  return name;
}

function contactGivenName(email) {
  var contact = ContactsApp.getContact(email);
  if (!contact) return null;
  try {
    var given = contact.getGivenName();
    if (given) return cleanName(given);
  } catch (err) {}
  try {
    var full = contact.getFullName();
    if (full) return givenNameFromFullName(full);
  } catch (err) {}
  return null;
}

function mailboxDisplayName(email) {
  var query = 'from:"' + email.replace(/"/g, '') + '"';
  var threads = GmailApp.search(query, 0, 10) || [];
  if (!threads.length) return null;
  var messages = GmailApp.getMessagesForThreads(threads);
  var wanted = email.toLowerCase();
  for (var t = messages.length - 1; t >= 0; t--) {
    var threadMessages = messages[t] || [];
    for (var m = threadMessages.length - 1; m >= 0; m--) {
      var raw = threadMessages[m].getFrom();
      var name = displayNameFromHeader(raw, wanted);
      if (name) return name;
    }
  }
  return null;
}

function displayNameFromHeader(raw, wantedEmail) {
  if (!raw) return null;
  var match = raw.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  if (!match) return null;
  if (match[2].toLowerCase() !== wantedEmail) return null;
  var name = match[1].trim();
  if (!name || name.toLowerCase() === wantedEmail) return null;
  return givenNameFromFullName(name);
}

function givenNameFromFullName(fullName) {
  var parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return cleanName(parts[0]);
  return cleanName(parts.slice(0, -1).join(' '));
}

function parseLocalPartName(email) {
  var at = email.indexOf('@');
  if (at < 1) return null;
  var local = email.slice(0, at);
  var plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  var parts = local.split(/[._-]+/)
    .map(function (p) { return p.replace(/\d+$/, ''); })
    .filter(function (p) { return p && !/^\d+$/.test(p); });
  if (!parts.length) return null;
  return cleanName(parts.join(' '));
}

function isRoleAccount(email) {
  var at = email.indexOf('@');
  var local = at > 0 ? email.slice(0, at) : email;
  var plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  local = local.toLowerCase();
  if (ROLE_ACCOUNTS.indexOf(local) !== -1) return true;
  return /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|donotreply)/.test(local);
}

function cleanName(name) {
  var cleaned = String(name)
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeEmail(raw) {
  var value = String(raw || '').trim();
  var match = value.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return value.toLowerCase();
}

function buildGreeting(names) {
  var unique = [];
  var seen = {};
  names.forEach(function (name) {
    var key = String(name).toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      unique.push(name);
    }
  });
  if (!unique.length) return null;
  if (unique.length === 1) return 'Hey ' + unique[0] + '!';
  if (unique.length === 2) return 'Hey ' + unique[0] + ' and ' + unique[1] + '!';
  if (unique.length > 4) {
    return 'Hey ' + unique[0] + ', ' + unique[1] + ', and ' + (unique.length - 2) + ' others!';
  }
  return 'Hey ' + unique.slice(0, -1).join(', ') + ', and ' + unique[unique.length - 1] + '!';
}

function noNameMessage(missing) {
  return 'SmartIntro could not find names for: ' +
    missing.map(function (r) { return r.email; }).join(', ') +
    '. Add them to Google Contacts (or email them once so a display name is ' +
    'learned), then click the SmartIntro icon again.';
}

function messageCard(title, text) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('SmartIntro'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('<b>' + title + '</b>'))
      .addWidget(CardService.newTextParagraph().setText(text)))
    .build();
}
