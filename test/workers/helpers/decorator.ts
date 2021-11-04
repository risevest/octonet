import { eventGroup, handler} from "../../../src/workers/decorators";

@eventGroup('Wallet')
export class Wallet{
    // @ts-ignore
    private walletBalance: number;

    // @ts-ignore
    private userEvent: string;

    constructor(balance: number){
        this.walletBalance = balance;
    }

    @handler('fund')
    fund(amount: number){
        this.walletBalance += amount;
        this.userEvent = 'fund';
    }

    // withdraw(amount: number){
    //     this.walletBalance -= amount;
    //     this.userEvent = 'withdraw';
    // }
}

