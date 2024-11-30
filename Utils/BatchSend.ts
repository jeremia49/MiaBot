import { AnyMessageContent, MiscMessageGenerationOptions, } from '@whiskeysockets/baileys'

export const batchSendMessage = async(sock:{sendMessage}, dest:Array<string>, msg: AnyMessageContent, options : MiscMessageGenerationOptions = {})=>{
    const PromiseArr : Array<Promise<null>> = []
    for(const rec of dest){
        PromiseArr.push(sock.sendMessage(rec, msg, options))
    }
    return Promise.all(PromiseArr).catch(e=>{
        console.error("Error Broadcast",e)
    })
}

export const batchForwardMessage = async(sock:{sendMessage}, dest:Array<string>, msg: AnyMessageContent, options : MiscMessageGenerationOptions = {})=>{
    const PromiseArr : Array<Promise<null>> = []
    for(const rec of dest){
        PromiseArr.push(sock.sendMessage(rec, {forward: {key:{fromMe:false}, message: msg} , force : true }, options))
    }
    return Promise.all(PromiseArr).catch(e=>{
        console.error("Error Broadcast",e)
    })
}