import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { CertificateGenerator } from './cert_generator';
import { AppError } from '../../common/errors/app-error';
const forge: any = require('node-forge');

const DEFAULT_STORAGE = process.env.P12_STORAGE_DIR || path.resolve(__dirname, '../../../storage/p12');

const EKYC_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export class SignatureService {
  private storageDir: string;
  private generator: CertificateGenerator;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE;
    this.generator = new CertificateGenerator();
  }

  private async ensureStorage() {
    if (!fsSync.existsSync(this.storageDir)) {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  private safeFileName(ekycId: string) {
    // validated earlier
    return `${ekycId}.p12`;
  }

  private metaFileName(ekycId: string) {
    return `${ekycId}.json`;
  }

  validateEkycId(ekycId: string) {
    if (!ekycId || typeof ekycId !== 'string') throw new Error('ekycId required');
    if (!EKYC_ID_REGEX.test(ekycId)) throw new Error('ekycId invalid');
  }

  async createP12(opts: { ekycId: string; overwrite?: boolean; subject?: any; daysValid?: number; requestId?: string }) {
    const { ekycId, overwrite = false, subject, daysValid } = opts;
    this.validateEkycId(ekycId);
    await this.ensureStorage();

    const filename = this.safeFileName(ekycId);
    const finalPath = path.join(this.storageDir, filename);
    const metaPath = path.join(this.storageDir, this.metaFileName(ekycId));

    // server-managed passphrase: read from env var SIGN_P12_PASSPHRASE
    const serverPassphrase = process.env.SIGN_P12_PASSPHRASE;
    if (!serverPassphrase) {
      // WARNING: default passphrase used when env var is not set. In production set SIGN_P12_PASSPHRASE.
      console.warn('[SignatureService] SIGN_P12_PASSPHRASE not set; using insecure default passphrase `changeit`.');
    }
    const passphraseToUse = serverPassphrase || 'changeit';

    // generate p12 using server-controlled passphrase
    const genResult = await this.generator.generateSelfSignedP12(
      subject || { commonName: ekycId },
      { passphrase: passphraseToUse, daysValid },
    );

    // write file with exclusive/create or overwrite
    if (!overwrite) {
      // fail if exists
      try {
        const fd = await fs.open(finalPath, 'wx');
        try {
          await fd.writeFile(genResult.p12);
        } finally {
          await fd.close();
        }
      } catch (err: any) {
        if (err && (err as any).code === 'EEXIST') {
          throw new AppError(400, 'ALREADY_EXISTS', 'P12 already exists');
        }
        throw err;
      }
    } else {
      // write to temp then rename
      const tmp = finalPath + '.' + Date.now() + '.tmp';
      await fs.writeFile(tmp, genResult.p12);
      try {
        await fs.rename(tmp, finalPath);
      } catch (err) {
        // On some platforms rename over existing may fail, attempt unlink then rename
        try {
          await fs.unlink(finalPath).catch(() => {});
          await fs.rename(tmp, finalPath);
        } catch (e) {
          await fs.unlink(tmp).catch(() => {});
          throw e;
        }
      }
    }

    // compute fingerprint (sha256) from certPem
    const cert = forge.pki.certificateFromPem(genResult.certPem);
    const asn1 = forge.pki.certificateToAsn1(cert);
    const der = forge.asn1.toDer(asn1).getBytes();
    const sha256 = forge.md.sha256.create();
    sha256.update(der);
    const fingerprint = sha256.digest().toHex();

    const meta = {
      ekycId,
      filename,
      path: finalPath,
      createdAt: new Date().toISOString(),
      serialNumber: genResult.serialNumber,
      fingerprint,
      // store original subject and security marker if generator returned them
      subject: subject || { commonName: ekycId },
      securityCode: (genResult as any).securityCode ?? undefined,
    } as any;

    // write metadata sidecar
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    return meta;
  }

  async countByPrefix(prefix?: string) {
    await this.ensureStorage();
    const files = await fs.readdir(this.storageDir);
    const p = prefix ? (prefix.endsWith('*') ? prefix.slice(0, -1) : prefix) : '';
    const matched = files.filter(f => f.endsWith('.p12') && path.basename(f, '.p12').startsWith(p));
    return matched.length;
  }

  async listByPrefix(prefix?: string, options?: { limit?: number | undefined; offset?: number | undefined; details?: boolean | undefined }) {
    await this.ensureStorage();
    const { limit = 100, offset = 0, details = false } = options || {};
    const files = await fs.readdir(this.storageDir);
    const p = prefix ? (prefix.endsWith('*') ? prefix.slice(0, -1) : prefix) : '';
    const matched = files.filter(f => f.endsWith('.p12') && path.basename(f, '.p12').startsWith(p));
    const total = matched.length;
    const slice = matched.slice(offset, offset + limit);
    const items: any[] = [];
    for (const f of slice) {
      const ekycId = path.basename(f, '.p12');
      const stat = await fs.stat(path.join(this.storageDir, f));
      const item: any = { ekycId, filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      if (details) {
        const metaPath = path.join(this.storageDir, this.metaFileName(ekycId));
        try {
          const raw = await fs.readFile(metaPath, 'utf8');
          const meta = JSON.parse(raw);
          item.serialNumber = meta.serialNumber;
          item.fingerprint = meta.fingerprint;
        } catch (e) {
          // If sidecar missing, try to parse p12 quickly (avoid passphrase)
          try {
            const p12buf = await fs.readFile(path.join(this.storageDir, f));
              // Attempt parse: node-forge PKCS12 requires binary string
              const asn1 = forge.asn1.fromDer(p12buf.toString('binary'));
              // use server passphrase when trying to parse
              const serverPass = process.env.SIGN_P12_PASSPHRASE || 'changeit';
              const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, serverPass);
            const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
            const certBag = bags[forge.pki.oids.certBag] && bags[forge.pki.oids.certBag][0];
            if (certBag) {
              const cert = certBag.cert;
              const derCert = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
              const sha256 = forge.md.sha256.create();
              sha256.update(derCert);
              item.fingerprint = sha256.digest().toHex();
              item.serialNumber = cert.serialNumber;
            }
          } catch (ex) {
            // ignore
          }
        }
      }
      items.push(item);
    }
    return { total, items };
  }

  async deleteByEkycId(ekycId: string) {
    this.validateEkycId(ekycId);
    await this.ensureStorage();
    const filename = this.safeFileName(ekycId);
    const finalPath = path.join(this.storageDir, filename);
    const metaPath = path.join(this.storageDir, this.metaFileName(ekycId));
    try {
      await fs.unlink(finalPath);
    } catch (e: any) {
      // If file doesn't exist
      throw new AppError(404, 'NOT_FOUND', 'P12 not found');
    }
    try {
      await fs.unlink(metaPath).catch(() => {});
    } catch (e) {}
    return { ekycId, deleted: true };
  }
}
