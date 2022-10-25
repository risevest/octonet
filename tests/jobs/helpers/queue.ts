export class TestInstance {
  constructor(private city: string, private greetings: string[]) {}

  greet(name: string) {
    return new Promise<void>((resolve, _) => {
      this.greetings.push(`hello ${this.city}, ${name} is back!`);
      console.log("THIS IN GREETING", this);
      resolve();
    });
  }
}
