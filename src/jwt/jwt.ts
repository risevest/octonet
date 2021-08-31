import jwt from 'jsonwebtoken';

export class JWT {
  private jwt_secret: string;

  constructor(secret: string) {
    this.jwt_secret = secret;
  }

  async encode<T = any>(payload: any, time: string): Promise<string> {

    const token = await jwt.sign(payload, this.jwt_secret, { expiresIn: time })
    return token;
  }


}
