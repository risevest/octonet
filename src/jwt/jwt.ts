import jwt from 'jsonwebtoken';

export class JWT {
  private jwt_secret: string;

  constructor(secret: string) {
    this.jwt_secret = secret;
  }

  async encode(payload: any, time: string): Promise<string> {

    const token = await jwt.sign(payload, this.jwt_secret, { expiresIn: time })
    return token;
  }

  async decode(token: any): Promise<string> {

    const decode = await jwt.verify(token, this.jwt_secret)
    return decode;
  }


}
