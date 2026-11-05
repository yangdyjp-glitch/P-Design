import {generateKeyPairSync,publicEncrypt,constants} from 'node:crypto';
import {localKey} from './api-local.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:4096});
const privateJwk=privateKey.export({format:'jwk'});
const encrypted=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(localKey()));
process.stdout.write(JSON.stringify({n:privateJwk.n,d:privateJwk.d,ciphertext:encrypted.toString('base64url')}));
