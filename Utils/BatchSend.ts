import { SocketConfig,AnyMessageContent, MiscMessageGenerationOptions, } from "@adiwajshing/baileys-md"

const BatchSendMessage = async(sock:{sendMessage}, dest:Array<String>, msg: AnyMessageContent, options : MiscMessageGenerationOptions = {})=>{
    const PromiseArr : Array<Promise<null>> = []
    for(let rec of dest){
        await sock.sendMessage(rec, msg, options)
    }
    return Promise.all(PromiseArr).catch(e=>{
        console.error("Error Broadcast",e)
    })
}

export default BatchSendMessage