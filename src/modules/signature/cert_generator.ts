import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// node-forge does not have official TS types in this project; use require and any
const forge: any = require('node-forge');

export class CertificateGenerator {
  /**
   * Generate a self-signed certificate and PKCS#12. Also embed a small security extension
   * that contains an HMAC-based code over the provided ekycId so the server can later
   * identify certificates it issued without storing the P12.
   */
  async generateSelfSignedP12(subject: any, options: any = {}): Promise<{ p12: Buffer; certPem: string; keyPem: string; serialNumber: string; ekycId?: string; securityCode?: string }> {
    const passphrase = options.passphrase || '';
    const daysValid = options.daysValid || 3650;
    const keySize = options.keySize || 2048;
    const friendlyName = options.friendlyName || (subject?.commonName || 'Signer');

    const keys = await new Promise<any>((resolve, reject) => {
      forge.pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err: any, keypair: any) => {
        if (err) return reject(err);
        resolve(keypair);
      });
    });

    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    const serialNumber = this._generateSerialNumberHex();
    cert.serialNumber = serialNumber;
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + daysValid);

    const attrs = this._buildSubjectAttrs(subject);
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Decide ekycId early so we can include it as an extension before signing
    let ekycId: string | undefined = undefined;
    try {
      ekycId = subject?.commonName || options?.ekycId;
    } catch (e) {
      ekycId = undefined;
    }

    // Build base extensions and include our custom extension if secret available
    const baseExtensions: any[] = [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
      { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
      { name: 'nsCertType', client: true, email: true },
      subject?.email ? { name: 'subjectAltName', altNames: [{ type: 1, value: subject.email }] } : undefined,
    ].filter(Boolean);

    // If a server secret is configured, compute a securityCode HMAC over the ekycId
    // and embed it as a non-critical custom extension so verification can be done
    // later without the private key.
    let securityCode: string | undefined = undefined;
    const securitySecret = process.env.SIGN_SECURITY_SECRET;
    if (securitySecret && ekycId) {
      try {
        securityCode = crypto.createHmac('sha256', securitySecret).update(ekycId).digest('hex');
        const payload = JSON.stringify({ v: 1, ekycId, code: securityCode });
        const octet = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, forge.util.encodeUtf8(payload));
        const extDer = forge.asn1.toDer(octet).getBytes();
        baseExtensions.push({ id: '1.3.6.1.4.1.55555.1.2', critical: false, value: extDer });
        console.log('[CertificateGenerator] Will embed extension OID 1.3.6.1.4.1.55555.1.2:', payload);
        console.log('[CertificateGenerator] SecurityCode:', securityCode);
      } catch (e) {
        const msg = (e as any)?.message ?? String(e);
        console.warn('[CertificateGenerator] Failed to build security extension:', msg);
      }
    }

    cert.setExtensions(baseExtensions);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    const safeContents = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: '3des', friendlyName });
    const p12Der = forge.asn1.toDer(safeContents).getBytes();
    const p12 = Buffer.from(p12Der, 'binary');

    const res: any = { p12, certPem, keyPem, serialNumber };
    if (ekycId) res.ekycId = ekycId;
    if (securityCode) res.securityCode = securityCode;
    return res;
  }

  saveToFile(data: Buffer | string, filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      fs.writeFileSync(filePath, data, 'utf8');
    }
  }

  private _buildSubjectAttrs(subject: any) {
    const attrs: any[] = [];
    if (subject?.commonName) attrs.push({ name: 'commonName', value: subject.commonName });
    if (subject?.countryName) attrs.push({ name: 'countryName', value: subject.countryName });
    if (subject?.stateOrProvinceName) attrs.push({ shortName: 'ST', value: subject.stateOrProvinceName });
    if (subject?.localityName) attrs.push({ name: 'localityName', value: subject.localityName });
    if (subject?.organizationName) attrs.push({ name: 'organizationName', value: subject.organizationName });
    if (subject?.organizationalUnitName) attrs.push({ shortName: 'OU', value: subject.organizationalUnitName });
    if (subject?.email) attrs.push({ name: 'emailAddress', value: subject.email });
    if (!attrs.some(a => a.name === 'commonName')) attrs.push({ name: 'commonName', value: 'Signer' });
    return attrs;
  }

  private _generateSerialNumberHex() {
    const bytes = forge.random.getBytesSync(16);
    const msb = bytes.charCodeAt(0) & 0x7f;
    const fixed = String.fromCharCode(msb) + bytes.slice(1);
    return Buffer.from(fixed, 'binary').toString('hex');
  }
}
