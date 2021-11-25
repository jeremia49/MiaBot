import {GroupMetadata} from '@adiwajshing/baileys-md'

class AllGroupParser{

    private data : {[_: string]: GroupMetadata};

    constructor(p1 : {[_: string]: GroupMetadata}){
        this.data = p1
    }

    public getAllID(): Array<String>{
        return Object.keys(this.data)
    }

    public getCanChat() : Array<String>{
        const arr : Array<String> = []
        for(let group in this.data){
            if(this.data[group].announce === true) continue
            arr.push(this.data[group].id)
        }
        return arr
    }

}



export default AllGroupParser