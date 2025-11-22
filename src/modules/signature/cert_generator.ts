import fs from 'fs';
import path from 'path';
// node-forge does not have official TS types in this project; use require and any
const forge: any = require('node-forge');

export class CertificateGenerator {
  async generateSelfSignedP12(subject: any, options: any = {}): Promise<{ p12: Buffer; certPem: string; keyPem: string; serialNumber: string }> {
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

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
      { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
      { name: 'nsCertType', client: true, email: true },
      subject?.email ? { name: 'subjectAltName', altNames: [{ type: 1, value: subject.email }] } : undefined,
    ].filter(Boolean));

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    const safeContents = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      [cert],
      passphrase,
      { algorithm: '3des', friendlyName },
    );
    const p12Der = forge.asn1.toDer(safeContents).getBytes();
    const p12 = Buffer.from(p12Der, 'binary');

    return { p12, certPem, keyPem, serialNumber };
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
