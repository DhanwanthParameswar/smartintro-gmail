const BRAND_COLOR = '#1a73e8';
const PROP_TEMPLATE = 'smartintro_greeting_template';
const PROP_CONJUNCTION = 'smartintro_conjunction';
const PROP_NAMES = 'smartintro_names';
const DEFAULT_TEMPLATE = 'Hey {names}!';
const NAME_STORE_MAX = 130;
const NAME_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const UNRESOLVED_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_ACCOUNTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply', 'mailer', 'mailer-daemon',
  'postmaster', 'webmaster', 'abuse', 'security', 'privacy', 'info', 'infos',
  'support', 'help', 'hello', 'hi', 'contact', 'team', 'sales', 'billing',
  'accounts', 'admin', 'office', 'hr', 'media', 'press', 'newsletter',
  'service', 'services', 'feedback', 'jobs', 'careers', 'customer-service'
];

var NAME_STORE = null;

function smartIntroHomepage() {
  return [buildHomeCard(loadSettings(), '')];
}

function buildHomeCard(settings, message) {
  var exampleSingle = buildGreeting(['Sarah'], settings);
  var exampleTwo = buildGreeting(['Sarah', 'Bob'], settings);
  var exampleMany = buildGreeting(['Sarah', 'Bob', 'Chris', 'Dana', 'Evan'], settings);

  var infoSection = CardService.newCardSection()
    .setHeader('How it works')
    .addWidget(CardService.newTextParagraph().setText(
      'While composing an email, click the SmartIntro icon in the compose window ' +
      'and hit <b>Insert greeting</b>. SmartIntro reads the people in the To field ' +
      'and writes a greeting into your message.'));
  infoSection.addWidget(CardService.newTextParagraph().setText(
    'Names are resolved from your <b>Google Contacts</b> first, then from the ' +
    'display names of past emails you received from the same address, then from ' +
    'the address itself. Recipients without a resolvable name are skipped. ' +
    'Looked-up names are cached so the compose window loads instantly.'));

  var previewSection = CardService.newCardSection().setHeader('Examples with your settings')
    .addWidget(CardService.newTextParagraph().setText(escapeHtml(
      exampleSingle + ' (1 person)\n' +
      exampleTwo + ' (2 people)\n' +
      exampleMany + ' (5+ people)')));
  if (message) {
    previewSection.addWidget(CardService.newTextParagraph().setText('<b>' + message + '</b>'));
  }

  var templateInput = CardService.newTextInput()
    .setFieldName('template')
    .setTitle('Greeting template')
    .setValue(settings.template)
    .setHint('Use {names} where recipient names should go')
    .setOnChangeAction(CardService.newAction().setFunctionName('updateGreetingPreview'));

  var separatorInput = CardService.newTextInput()
    .setFieldName('conjunction')
    .setTitle('Separator between names')
    .setValue(settings.conjunction)
    .setHint('e.g. and, &, +')
    .setOnChangeAction(CardService.newAction().setFunctionName('updateGreetingPreview'));

  var saveButton = CardService.newTextButton()
    .setText('Save settings')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(BRAND_COLOR)
    .setOnClickAction(CardService.newAction().setFunctionName('saveGreetingSettings'));

  var settingsSection = CardService.newCardSection().setHeader('Greeting settings')
    .addWidget(templateInput)
    .addWidget(separatorInput)
    .addWidget(saveButton);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('SmartIntro'))
    .addSection(infoSection)
    .addSection(settingsSection)
    .addSection(previewSection)
    .build();
}

function updateGreetingPreview(e) {
  var settings = currentFormSettings(e);
  return navigationTo(buildHomeCard(settings, ''));
}

function saveGreetingSettings(e) {
  var settings = currentFormSettings(e);
  var template = String(settings.template || '').trim();
  if (!template) {
    return navigationTo(buildHomeCard(loadSettings(),
      'Template cannot be empty - keeping your previous settings.'));
  }
  var props = PropertiesService.getUserProperties();
  props.setProperty(PROP_TEMPLATE, template);
  props.setProperty(PROP_CONJUNCTION, settings.conjunction);
  return navigationTo(buildHomeCard(settings, 'Settings saved.'));
}

function currentFormSettings(e) {
  var saved = loadSettings();
  var template = formValue(e, 'template');
  var conjunction = formValue(e, 'conjunction');
  return {
    template: (template !== null && String(template).trim()) || saved.template,
    conjunction: conjunction !== null && String(conjunction).trim() ? String(conjunction).trim() : saved.conjunction
  };
}

function loadSettings() {
  var props = PropertiesService.getUserProperties();
  var template = props.getProperty(PROP_TEMPLATE);
  var conjunction = props.getProperty(PROP_CONJUNCTION);
  return {
    template: template ? template : DEFAULT_TEMPLATE,
    conjunction: conjunction && conjunction.trim() ? conjunction.trim() : 'and'
  };
}

function formValue(e, fieldId) {
  if (!e) return null;
  var layer1 = (e.commonEventObject && e.commonEventObject.formInputs) ||
    e.formInputs || e.formInput;
  var layer2 = layer1 ? layer1[fieldId] : null;
  if (!layer2) return null;
  if (layer2.stringInputs && layer2.stringInputs.value && layer2.stringInputs.value.length) {
    return layer2.stringInputs.value[0];
  }
  if (layer2.selectionInput && typeof layer2.selectionInput.selected !== 'undefined') {
    return layer2.selectionInput.selected;
  }
  if (typeof layer2 === 'string') return layer2;
  return null;
}

function navigationTo(card) {
  return CardService.newActionResponseBuilder()
    .setStateChanged(true)
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

function smartIntroCompose(e) {
  try {
    var recipients = getToRecipients(e);
    if (!recipients.length) {
      return [messageCard('No recipients yet', 'Add recipients to the To field, then click the SmartIntro icon again.')];
    }
    return [buildComposeCard(recipients, '')];
  } catch (err) {
    return [messageCard('SmartIntro error', String(err))];
  }
}

function buildComposeCard(recipients, note) {
  var settings = loadSettings();

  var resolved = recipients.map(function (raw) {
    var email = normalizeEmail(raw);
    return { email: email, name: resolveDisplayName(email) };
  });

  var missing = resolved.filter(function (r) { return !r.name; });
  var named = resolved.filter(function (r) { return r.name; });

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

  var refreshAction = CardService.newAction()
    .setFunctionName('refreshComposeNames')
    .setParameters({ emails: JSON.stringify(recipients) });
  var refreshButton = CardService.newTextButton()
    .setText('Refresh names')
    .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
    .setOnClickAction(refreshAction);

  var builder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('SmartIntro'))
    .addSection(section);

  if (named.length) {
    var greeting = buildGreeting(named.map(function (r) { return r.name; }), settings);
    var insertAction = CardService.newAction()
      .setFunctionName('insertSmartIntroGreeting')
      .setParameters({ greeting: greeting });
    var insertButton = CardService.newTextButton()
      .setText('Insert greeting')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor(BRAND_COLOR)
      .setOnClickAction(insertAction);

    var previewSection = CardService.newCardSection().setHeader('Will insert')
      .addWidget(CardService.newTextParagraph().setText(
        '"' + escapeHtml(greeting) + '"'));
    if (note) {
      previewSection.addWidget(CardService.newTextParagraph().setText('<b>' + note + '</b>'));
    }
    builder.addSection(previewSection);
    builder.addSection(CardService.newCardSection().addWidget(insertButton));
  } else {
    var emptySection = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(
        '<b>No names found yet.</b> SmartIntro learns names from your contacts and ' +
        'past emails. If these people are new, click Refresh names after they appear ' +
        'in your contacts or mailbox.' + (note ? ' <b>' + note + '</b>' : '')));
    builder.addSection(emptySection);
  }

  builder.addSection(CardService.newCardSection().addWidget(refreshButton));
  return builder.build();
}

function refreshComposeNames(e) {
  var parameters = e && ((e.commonEventObject && e.commonEventObject.parameters) || e.parameters) || {};
  var emails = [];
  try {
    emails = JSON.parse(parameters.emails || '[]');
  } catch (err) {
    emails = [];
  }
  if (emails.length) {
    var store = getNameStore();
    emails.forEach(function (email) {
      delete store[normalizeEmail(email)];
    });
    persistNameStore();
    var cache = CacheService.getScriptCache();
    emails.forEach(function (email) {
      cache.remove('si-name-' + normalizeEmail(email));
    });
  }
  return [buildComposeCard(emails, 'Names refreshed.')];
}

function insertSmartIntroGreeting(e) {
  var parameters = e && ((e.commonEventObject && e.commonEventObject.parameters) || e.parameters) || {};
  var greeting = parameters.greeting || '';
  if (!greeting) {
    try {
      greeting = buildGreeting(['there'], loadSettings());
    } catch (err) {
      greeting = 'Hey there!';
    }
  }
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(greeting + '\n\n', CardService.ContentType.TEXT)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}

function buildGreeting(names, settings) {
  var joined = joinNames(names, settings.conjunction);
  if (!joined) return '';
  var template = String(settings.template || DEFAULT_TEMPLATE).trim();
  var filled = template.split('{names}').join(joined).trim();
  return filled || ('Hey ' + joined + '!');
}

function joinNames(names, separator) {
  var unique = [];
  var seen = {};
  names.forEach(function (name) {
    var key = String(name).toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      unique.push(name);
    }
  });
  if (!unique.length) return '';
  var sep = String(separator || '').trim() || 'and';
  var isPunctuation = /^[^a-zA-Z0-9]+$/.test(sep);
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) {
    return isPunctuation ? unique[0] + sep + unique[1] : unique[0] + ' ' + sep + ' ' + unique[1];
  }
  var junction = isPunctuation ? ' ' + sep + ' ' : ' ' + sep + ' ';
  if (sep.toLowerCase() === 'and') junction = ', and ';
  if (unique.length > 4) {
    return unique.slice(0, 2).join(', ') + junction + (unique.length - 2) + ' others';
  }
  return unique.slice(0, -1).join(', ') + junction + unique[unique.length - 1];
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
  var cacheKey = 'si-name-' + email;
  var cached = cache.get(cacheKey);
  if (cached !== null) return cached === '_' ? null : cached;

  var store = getNameStore();
  var entry = store[email];
  var now = Date.now();
  if (entry) {
    if (entry[0] && entry[0] !== '_') {
      cache.put(cacheKey, entry[0], 600);
      return entry[0];
    }
    if (now - entry[1] < UNRESOLVED_RETRY_MS) {
      cache.put(cacheKey, '_', 600);
      return null;
    }
    delete store[email];
  }

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

  store[email] = [name || '_', now];
  persistNameStore();
  cache.put(cacheKey, name || '_', 600);
  return name;
}

function getNameStore() {
  if (NAME_STORE === null) {
    try {
      NAME_STORE = JSON.parse(PropertiesService.getUserProperties().getProperty(PROP_NAMES) || '{}');
    } catch (err) {
      NAME_STORE = {};
    }
    if (typeof NAME_STORE !== 'object' || !NAME_STORE) NAME_STORE = {};
  }
  return NAME_STORE;
}

function persistNameStore() {
  var store = getNameStore();
  var now = Date.now();
  var keys = Object.keys(store);
  keys.forEach(function (email) {
    var entry = store[email];
    if (!Array.isArray(entry) || now - (entry[1] || 0) > NAME_TTL_MS) delete store[email];
  });
  keys = Object.keys(store);
  if (keys.length > NAME_STORE_MAX) {
    keys.sort(function (a, b) { return store[a][1] - store[b][1]; });
    keys.slice(0, keys.length - NAME_STORE_MAX).forEach(function (email) {
      delete store[email];
    });
  }
  try {
    PropertiesService.getUserProperties().setProperty(PROP_NAMES, JSON.stringify(store));
  } catch (err) {}
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
  var query = 'from:"' + email.replace(/"/g, '') + '" newer_than:2y';
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
