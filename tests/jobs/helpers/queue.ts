import { generateSecret } from "jose";

export class TestInstance {
  constructor(private name: string) {}

  greet(): string {
    return `${this.name} says hi!`;
  }
}
