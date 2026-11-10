const fs = require('node:fs');
const path = require('node:path');
const { siteUrl } = require('./control');

function domainFromInput(value) {
  const url = new URL(siteUrl(value));
  if (url.hostname.startsWith('www.') && url.hostname.split('.').length > 2)
    return url.hostname.slice(4);
  return url.hostname;
}

function readRules(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeRules(file, rules) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(rules, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function addRule(file, input) {
  const domain = domainFromInput(input);
  const rules = readRules(file);
  if (!rules.includes(domain)) { rules.push(domain); rules.sort(); writeRules(file, rules); }
  return rules;
}

function removeRule(file, domain) {
  if (typeof domain !== 'string') throw new Error('Invalid domain');
  const rules = readRules(file).filter(item => item !== domain);
  writeRules(file, rules);
  return rules;
}

module.exports = { domainFromInput, readRules, addRule, removeRule };
