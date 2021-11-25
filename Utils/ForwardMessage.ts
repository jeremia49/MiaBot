import { SocketConfig,AnyMessageContent, MiscMessageGenerationOptions, } from "@adiwajshing/baileys-md"

const ForwardMessage = async(sock:{sendMessage}, dest:Array<String>, msg: AnyMessageContent, options : MiscMessageGenerationOptions = {})=>{
    const PromiseArr : Array<Promise<null>> = []
    for(let rec of dest){
        await sock.sendMessage(rec, {forward: msg, force : true }, options)
    }
    return Promise.all(PromiseArr).catch(e=>{
        console.error("Error Broadcast",e)
    })
}

export default ForwardMessage