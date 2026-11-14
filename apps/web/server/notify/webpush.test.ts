import {
  createPublicKey,
  generateKeyPairSync,
  verify,
  createDecipheriv,
  hkdfSync,
  diffieHellman,
  createPrivateKey,
} from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  classify,
  encryptPayload,
  vapidAuthorization,
  vapidPushSender,
  vapidUsable,
  payloadText,
} from './webpush';
import { integrationsFromEnv } from './deps';

const b = (s: string): Buffer => Buffer.from(s, 'base64url');

describe('web push encryption (RFC 8291)', () => {
  // The example in RFC 8291 appendix A and section 5, byte for byte.
  it('gives the RFC example message exactly', () => {
    const body = encryptPayload(
      b('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
      {
        p256dh: b(
          'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        ),
        authSecret: b('BTBZMqHH6r4Tts7J_aSIgg'),
      },
      {
        privateKey: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        publicKey: b(
          'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
        ),
        salt: b('DGv6ra1nlYgDCS1FRnbzlw'),
      },
    );
    expect(body.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('can be opened by the browser that holds the private key (a random message)', () => {
    const ua = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = ua.publicKey.export({ format: 'jwk' });
    const uaPublic = Buffer.concat([Buffer.from([4]), b(jwk.x!), b(jwk.y!)]);
    const authSecret = Buffer.alloc(16, 3);
    const text = Buffer.from(JSON.stringify({ title: 'Rain overnight at Wattle Flat: 12 mm.' }));
    const body = encryptPayload(text, { p256dh: uaPublic, authSecret });
    // The browser's side, written from the RFC: read the header, derive the keys, open the record.
    const salt = body.subarray(0, 16);
    expect(body.readUInt32BE(16)).toBe(4096);
    const idlen = body[20]!;
    const asPublic = body.subarray(21, 21 + idlen);
    const cipher = body.subarray(21 + idlen);
    const asJwk = {
      kty: 'EC',
      crv: 'P-256',
      x: asPublic.subarray(1, 33).toString('base64url'),
      y: asPublic.subarray(33).toString('base64url'),
    };
    const secret = diffieHellman({
      privateKey: ua.privateKey,
      publicKey: createPublicKey({ key: asJwk, format: 'jwk' }),
    });
    const ikm = Buffer.from(
      hkdfSync(
        'sha256',
        secret,
        authSecret,
        Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]),
        32,
      ),
    );
    const cek = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
    );
    const nonce = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
    );
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(cipher.subarray(cipher.length - 16));
    const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
    expect(plain.at(-1)).toBe(2);
    expect(plain.subarray(0, -1).toString()).toBe(text.toString());
  });

  it('refuses a payload that does not fit one record', () => {
    expect(() =>
      encryptPayload(Buffer.alloc(5000), {
        p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]),
        authSecret: Buffer.alloc(16),
      }),
    ).toThrow();
  });
});

function vapidKeys() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = pair.privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.from([4]), b(j.x!), b(j.y!)]).toString('base64url');
  return { publicKey, privateKey: j.d!, pair };
}

describe('VAPID (RFC 8292)', () => {
  it('signs a token the push service can check with the public key', () => {
    const k = vapidKeys();
    const header = vapidAuthorization(
      'https://web.push.apple.com/abc/def',
      { publicKey: k.publicKey, privateKey: k.privateKey, subject: 'https://game.example.test' },
      Date.UTC(2026, 10, 17),
    );
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(k.publicKey);
    const claims = JSON.parse(b(m[2]!).toString());
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.sub).toBe('https://game.example.test');
    expect(claims.exp - Date.UTC(2026, 10, 17) / 1000).toBeLessThanOrEqual(24 * 3600);
    expect(JSON.parse(b(m[1]!).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(
      verify(
        'sha256',
        Buffer.from(`${m[1]}.${m[2]}`),
        { key: k.pair.publicKey, dsaEncoding: 'ieee-p1363' },
        b(m[3]!),
      ),
    ).toBe(true);
    expect(vapidUsable(k)).toBe(true);
    expect(vapidUsable({ publicKey: 'x', privateKey: 'y' })).toBe(false);
  });

  it('the command in .env.example makes a usable key pair', () => {
    const out = execFileSync(
      process.execPath,
      [
        '-e',
        "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=k.privateKey.export({format:'jwk'});const pub=Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url');console.log('VAPID_PUBLIC_KEY='+pub);console.log('VAPID_PRIVATE_KEY='+j.d)",
      ],
      { encoding: 'utf8' },
    );
    const pub = /VAPID_PUBLIC_KEY=(\S+)/.exec(out)![1]!;
    const priv = /VAPID_PRIVATE_KEY=(\S+)/.exec(out)![1]!;
    expect(vapidUsable({ publicKey: pub, privateKey: priv })).toBe(true);
    const i = integrationsFromEnv({
      VAPID_PUBLIC_KEY: pub,
      VAPID_PRIVATE_KEY: priv,
      GG_SITE_URL: 'https://game.example.test',
    });
    expect(i.push).not.toBeNull();
    expect(i.vapidPublicKey).toBe(pub);
    expect(integrationsFromEnv({}).push).toBeNull();
    expect(
      integrationsFromEnv({
        VAPID_PUBLIC_KEY: pub,
        VAPID_PRIVATE_KEY: 'bad',
        GG_SITE_URL: 'https://x.test',
      }).push,
    ).toBeNull();
  });
});

describe('the real sender', () => {
  const k = vapidKeys();
  const ua = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = ua.publicKey.export({ format: 'jwk' });
  const target = {
    endpoint: 'https://web.push.apple.com/abc',
    p256dh: Buffer.concat([Buffer.from([4]), b(j.x!), b(j.y!)]).toString('base64url'),
    authSecret: Buffer.alloc(16, 5).toString('base64url'),
  };
  const message = {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    title: 'Hello',
    body: null,
    link: '/play',
  };

  it('posts an encrypted body with the headers a push service expects, and follows no redirect', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const sender = vapidPushSender({ ...k, subject: 'https://game.example.test' }, fake);
    expect(await sender.send(target, message, { ttlSec: 3600, topic: 'abc' })).toEqual({
      ok: true,
    });
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe(target.endpoint);
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.TTL).toBe('3600');
    expect(h.Topic).toBe('abc');
    expect(h.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(calls[0]!.init.redirect).toBe('error');
    // The message carries the fact line, a same-site link and an id, and nothing else.
    expect(JSON.parse(payloadText(message))).toEqual({
      id: message.id,
      title: 'Hello',
      body: null,
      link: '/play',
    });
  });

  it('reads the push service answers', async () => {
    expect(classify(201, null)).toEqual({ ok: true });
    expect(classify(410, null)).toMatchObject({ ok: false, gone: true, retry: false });
    expect(classify(404, null)).toMatchObject({ gone: true });
    expect(classify(429, '30')).toMatchObject({ retry: true, retryAfterSec: 30 });
    expect(classify(503, null)).toMatchObject({ retry: true });
    expect(classify(401, null)).toMatchObject({
      retry: false,
      gone: false,
      reason: 'push_auth_rejected',
    });
    expect(classify(413, null)).toMatchObject({ reason: 'push_too_large' });
    const down = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(
      await vapidPushSender({ ...k, subject: 'https://x.test' }, down).send(target, message, {
        ttlSec: 1,
        topic: 't',
      }),
    ).toMatchObject({ retry: true });
    // Keys that do not decode mean this device can never be reached.
    const bad = await vapidPushSender({ ...k, subject: 'https://x.test' }, down).send(
      { ...target, p256dh: 'AAAA' },
      message,
      { ttlSec: 1, topic: 't' },
    );
    expect(bad).toMatchObject({ gone: true });
    void createPrivateKey;
  });
});
