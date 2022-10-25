export class TestInstance {
  constructor(private city: string, private greetings: string[]) {}

  greet(name: string) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.greetings.push(`hello ${this.city}, ${name} is back!`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }
}
