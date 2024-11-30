import {GroupMetadata} from '@whiskeysockets/baileys'

class AllGroupParser{

    private data : {[_: string]: GroupMetadata};

    constructor(p1 : {[_: string]: GroupMetadata}){
        this.data = p1
    }

    public getAllID(): Array<string>{
        return Object.keys(this.data)
    }

    public getCanChat() : Array<string>{
        const arr : Array<string> = []
        for(const group in this.data){
            if(this.data[group].announce === true) continue
            arr.push(this.data[group].id)
        }
        return arr
    }

}



export default AllGroupParser