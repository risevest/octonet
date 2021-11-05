import { eventGroup, handler} from "../../../src/workers/decorators";

export let amount = 100;

@eventGroup('wallet')
export class Wallet{

    @handler('fund')
    fund(a: number){
        amount = a;
    }

}
