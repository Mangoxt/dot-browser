import { describe, expect, it } from 'vitest';
import { passwordCSV, cookieFile } from '../src/main/import-formats';

describe('Exported browser credentials', () => {
  it('handles Chrome CSV quotes, BOMs, commas and multiline passwords without trimming secrets', () => {
    const bundle = passwordCSV(
      '\uFEFFname,url,username,password\r\nSite,https://example.com/login,"user,name"," space,""quote""\nline "\r\n',
    );
    expect(bundle.passwords).toEqual([
      { origin: 'https://example.com', username: 'user,name', password: ' space,"quote"\nline ' },
    ]);
  });
  it('accepts Firefox exports and filters unsupported or credential-bearing URLs', () => {
    const bundle = passwordCSV(
      'url,username,password,httpRealm\nhttps://site.test/path,user,secret,\njavascript:alert(1),user,secret,\nhttps://user:pass@site.test,user,secret,\nhttps://site.test,blank,,',
    );
    expect(bundle.passwords).toHaveLength(1);
    expect(bundle.warnings.join(' ')).toContain('3');
  });
  it('rejects wrong headers and truncated CSV without including secrets in errors', () => {
    expect(() => passwordCSV('name,secret\nsite,password')).toThrow('columns');
    expect(() => passwordCSV('url,username,password\nhttps://site.test,user,"secret')).toThrow(
      'Incomplete',
    );
  });
  it('normalizes Netscape HttpOnly cookies and skips expired cookies', () => {
    const bundle = cookieFile(
      '# Netscape HTTP Cookie File\n#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tsession\tvalue\n.example.com\tTRUE\t/\tTRUE\t1\texpired\tvalue',
    );
    expect(bundle.cookies).toHaveLength(1);
    expect(bundle.cookies[0]).toMatchObject({
      domain: '.example.com',
      httpOnly: true,
      secure: true,
      name: 'session',
      value: 'value',
    });
    expect(bundle.warnings).toHaveLength(1);
  });
  it('accepts cookie JSON and rejects malformed domains', () => {
    const bundle = cookieFile(
      JSON.stringify({
        cookies: [
          { domain: 'site.test', name: 'login', value: 'fake', sameSite: 'lax' },
          { domain: 'bad@site.test', name: 'bad', value: 'fake' },
        ],
      }),
    );
    expect(bundle.cookies).toHaveLength(1);
    expect(bundle.cookies[0].sameSite).toBe('lax');
  });
  it('uses a generic malformed JSON error without echoing cookie values', () => {
    expect(() => cookieFile('[{"value":"sensitive-cookie",')).toThrow(
      'Cookie export is not valid JSON.',
    );
    expect(cookieFile('malformed\tTRUE').cookies).toEqual([]);
  });
});
