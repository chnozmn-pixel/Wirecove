#!/usr/bin/env node
// Builds the address-block -> country table the Countries panel reads.
//
// The source is the five regional internet registries' own delegation
// records, which is the authoritative statement of who an address block was
// handed to. They are published openly by the registries themselves, carry no
// licence that has to be reproduced in the interface, and need no account.
// Nothing is fetched while the application runs: this is a packaging step,
// like fetching the interpreter, and a build without it ships no table and
// says so rather than guessing.
//
// What the result means, precisely: the country a block is registered to.
// That is not always where the machine is. A provider registered in one
// country may announce its addresses in another, and the panel says it is
// reading the registry rather than locating anyone.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const SOURCES = [
  'https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest',
  'https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest',
  'https://ftp.apnic.net/stats/apnic/delegated-apnic-extended-latest',
  'https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest',
  'https://ftp.afrinic.net/stats/afrinic/delegated-afrinic-extended-latest'
];

const OUTPUT = path.join(__dirname, '..', 'native', 'geo', 'ranges.bin');
const MAGIC = Buffer.from('WCGEO1\n', 'ascii');

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error(`Too many redirects for ${url}`));
    https.get(url, { timeout: 120000 }, response => {
      const status = response.statusCode;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        return resolve(download(new URL(response.headers.location, url).toString(), redirects + 1));
      }
      if (status !== 200) {
        response.resume();
        return reject(new Error(`${url} answered ${status}`));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject).on('timeout', function () {
      this.destroy(new Error(`${url} timed out`));
    });
  });
}

function ipv4ToInt(text) {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

// Only the top 64 bits are kept: no registry delegates a country a block
// finer than a /64, so the lower half can never change the answer.
function ipv6Top64(text) {
  const [head, tail = ''] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = text.includes('::')
    ? left.concat(Array(8 - left.length - right.length).fill('0'), right)
    : left;
  if (groups.length !== 8) return null;
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    const group = parseInt(groups[index] || '0', 16);
    if (!Number.isInteger(group) || group < 0 || group > 0xFFFF) return null;
    value = (value << 16n) | BigInt(group);
  }
  return value;
}

function parse(text, v4, v6) {
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('|');
    if (fields.length < 7) continue;
    const [, country, type, start, value, , status] = fields;
    if (status !== 'allocated' && status !== 'assigned') continue;
    if (!/^[A-Z]{2}$/.test(country)) continue;
    if (type === 'ipv4') {
      const first = ipv4ToInt(start);
      const count = Number(value);
      // The count is a number of addresses, not a prefix length, and is not
      // always a power of two - a block can be split between two countries.
      if (first === null || !Number.isInteger(count) || count < 1) continue;
      if (first + count - 1 > 0xFFFFFFFF) continue;
      v4.push([first, first + count - 1, country]);
    } else if (type === 'ipv6') {
      const first = ipv6Top64(start);
      const prefix = Number(value);
      if (first === null || !Number.isInteger(prefix) || prefix < 1 || prefix > 128) continue;
      const span = prefix >= 64 ? 0n : (1n << BigInt(64 - prefix)) - 1n;
      v6.push([first, first + span, country]);
    }
  }
}

// Neighbouring blocks that went to the same country are one range as far as a
// lookup is concerned, and merging them makes the table smaller to carry and
// faster to search.
function merge(rows, one) {
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const merged = [];
  for (const row of rows) {
    const last = merged[merged.length - 1];
    if (last && last[2] === row[2] && row[0] <= last[1] + one) {
      if (row[1] > last[1]) last[1] = row[1];
      continue;
    }
    if (last && row[0] <= last[1]) continue;  // overlap with another country
    merged.push([row[0], row[1], row[2]]);
  }
  return merged;
}

async function main() {
  const v4 = [];
  const v6 = [];
  for (const url of SOURCES) {
    process.stdout.write(`${url}\n`);
    parse(await download(url), v4, v6);
  }
  const ranges4 = merge(v4, 1);
  const ranges6 = merge(v6, 1n);
  if (ranges4.length < 1000) throw new Error('The registry files produced almost no ranges');

  const body = Buffer.alloc(ranges4.length * 10 + ranges6.length * 18);
  let offset = 0;
  for (const [start, end, country] of ranges4) {
    body.writeUInt32LE(start, offset);
    body.writeUInt32LE(end, offset + 4);
    body.write(country, offset + 8, 2, 'ascii');
    offset += 10;
  }
  for (const [start, end, country] of ranges6) {
    body.writeBigUInt64LE(start, offset);
    body.writeBigUInt64LE(end, offset + 8);
    body.write(country, offset + 16, 2, 'ascii');
    offset += 18;
  }
  const head = Buffer.from(
    `${new Date().toISOString().slice(0, 10)} ${ranges4.length} ${ranges6.length}\n`, 'ascii');
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, Buffer.concat([MAGIC, head, body]));
  const size = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  process.stdout.write(
    `${ranges4.length} IPv4 and ${ranges6.length} IPv6 ranges -> ${OUTPUT} (${size} MB)\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
