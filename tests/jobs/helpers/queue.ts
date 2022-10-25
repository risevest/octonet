export class TestInstance {
  constructor(private city: string, private greetings: string[]) {}

  greet(name: string) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.greetings.push(`hello ${this.city}, ${name} is back!`);
        console.log("THIS IN GREETING", this);
        resolve();
      } catch (err) {
        console.log("error", err);
        reject(err);
      }
    });
  }
}
